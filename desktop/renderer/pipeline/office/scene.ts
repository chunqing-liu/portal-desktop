import { Application, Container, Graphics, Text } from 'pixi.js';
import 'pixi.js/unsafe-eval';
import type { OfficePresence } from '../../../shared/office';
import type { OfficeRuntime } from './vendor/runtime/OfficeRuntime';
import { AgentEntity } from './vendor/scene/entities/AgentEntity';
import { createOfficePropViews, type PropView } from './vendor/scene/views/propViews';
import { projectAgents } from './vendor/runtime/adapters/legacy';
import { computeAgentDepthZ } from './vendor/scene/systems/deskDepthSort';
import { CELL_PIXELS } from './vendor/scene/gridProjection';

export class StarmapScene {
  private app?: Application;
  private world = new Container();
  private layer = new Container();
  private highlight = new Graphics();
  private entities = new Map<string, AgentEntity>();
  private labels = new Map<string, Text>();
  private props: PropView[] = [];
  private observer?: ResizeObserver;
  private resize?: () => void;
  private unsubscribe?: () => void;
  private disposed = false;
  private active = false;
  private reduced = false;
  private selected: string[] = [];
  private presence = new Map<string, OfficePresence>();
  constructor(private runtime: OfficeRuntime, private onActor: (id: string) => void) {}

  async mount(element: HTMLElement) {
    const app = new Application();
    await app.init({ width: Math.max(1, element.clientWidth), height: Math.max(1, element.clientHeight), backgroundColor: 0xece8dd, antialias: false, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 2), autoStart: false });
    if (this.disposed) { app.destroy(true, { children: true }); return; }
    this.app = app;
    element.appendChild(app.canvas);
    app.canvas.setAttribute('aria-label', '伙伴的像素办公室，等价信息见人员列表');
    app.ticker.maxFPS = 30;
    this.layer.sortableChildren = true;
    app.stage.addChild(this.world);
    this.populate();
    const resize = () => {
      if (this.disposed || element.clientWidth < 1 || element.clientHeight < 1) return;
      app.renderer.resize(element.clientWidth, element.clientHeight);
      const data = this.runtime.readWorld();
      const scale = Math.min(element.clientWidth / (data.width * CELL_PIXELS), element.clientHeight / (data.height * CELL_PIXELS));
      this.world.scale.set(scale);
      this.world.position.set((element.clientWidth - data.width * CELL_PIXELS * scale) / 2, (element.clientHeight - data.height * CELL_PIXELS * scale) / 2);
      if (this.active) app.render();
    };
    this.resize = resize;
    this.observer = new ResizeObserver(resize);
    this.observer.observe(element);
    this.unsubscribe = this.runtime.subscribe(() => this.sync());
    this.sync(); resize();
    app.ticker.add(this.onTick);
    this.setActive(this.active);
  }

  private populate() {
    this.world.removeChildren().forEach(child => child.destroy({ children: true }));
    this.layer = new Container();
    this.layer.sortableChildren = true;
    this.highlight = new Graphics();
    this.entities.clear(); this.labels.clear();
    const data = this.runtime.readWorld();
    const floor = new Graphics();
    for (let row = 0; row < data.height; row++) for (let column = 0; column < data.width; column++) floor.rect(column * CELL_PIXELS, row * CELL_PIXELS, CELL_PIXELS, CELL_PIXELS).fill((column + row) % 2 ? 0xe4dfd2 : 0xebe6da);
    floor.rect(0, 0, data.width * CELL_PIXELS, 28).fill(0xb6c6b4);
    for (let column = 1; column < data.width; column += 3) floor.rect(column * CELL_PIXELS, 4, 65, 18).fill(0xd8e9eb).stroke({ color: 0x829b91, width: 3 });
    this.world.addChild(floor, this.highlight, this.layer);
    const registry = createOfficePropViews(() => false);
    const agents = projectAgents(this.runtime, false);
    this.props = data.props.map(prop => {
      const view = registry.create(prop, this.runtime.template(prop.templateId));
      view.roots.forEach(item => this.layer.addChild(item));
      view.update(prop, this.runtime.template(prop.templateId), agents);
      return view;
    });
    for (const agent of agents) {
      const entity = new AgentEntity(agent, false);
      entity.on('pointertap', event => { event.stopPropagation(); this.onActor(agent.id); });
      this.entities.set(agent.id, entity);
      this.layer.addChild(entity);
      const label = new Text({ text: agent.currentTask || '待命', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fill: 0x394b47 } });
      label.anchor.set(0.5, 0);
      label.zIndex = 10000;
      this.labels.set(agent.id, label);
      this.layer.addChild(label);
    }
  }
  replaceRuntime(runtime: OfficeRuntime) {
    this.unsubscribe?.();
    this.runtime = runtime;
    if (this.app) {
      this.populate();
      this.unsubscribe = runtime.subscribe(() => this.sync());
      this.sync(); this.resize?.();
    }
  }
  setPresence(entries: OfficePresence[]) { this.presence = new Map(entries.map(entry => [entry.identity.id, entry])); this.sync(); }
  private sync() {
    for (const agent of projectAgents(this.runtime, false)) {
      const entity = this.entities.get(agent.id);
      entity?.apply(agent);
      const presence = this.presence.get(agent.id);
      const stale = presence && (presence.expired || presence.disconnected || presence.status === 'offline');
      if (entity) { entity.tint = stale ? 0x929292 : 0xffffff; entity.alpha = stale ? 0.55 : 1; }
      if (entity) entity.zIndex = computeAgentDepthZ(agent);
      const label = this.labels.get(agent.id);
      if (label) { label.text = (agent.currentTask || '待命') + (stale ? ' · 过期 · ' + new Date(presence!.lastSeen).toLocaleTimeString() : ''); label.position.set(agent.x, agent.y + 28); }
    }
    this.drawSelection();
  }
  private onTick = () => {
    if (!this.active || !this.app) return;
    this.runtime.tick(this.app.ticker.deltaMS);
    this.sync();
    this.entities.forEach(entity => entity.updateVisuals(entity.data.state, this.reduced ? 0 : this.app!.ticker.deltaMS / 1000));
  };
  setActive(active: boolean) {
    this.active = active;
    if (active) this.app?.ticker.start(); else this.app?.ticker.stop();
  }
  setReduced(reduced: boolean) { this.reduced = reduced; }
  select(ids: string[]) { this.selected = ids; this.drawSelection(); }
  private drawSelection() {
    this.highlight.clear();
    const data = this.runtime.readWorld();
    for (const actor of data.actors.filter(actor => this.selected.includes(actor.id))) {
      const desk = data.props.find(prop => prop.id === actor.homeId);
      if (desk) this.highlight.rect(desk.position.x * CELL_PIXELS - 8, desk.position.y * CELL_PIXELS - 15, 120, 130).fill({ color: 0x779bc0, alpha: 0.18 }).stroke({ color: 0x447ca1, width: 3 });
    }
  }
  dispose() {
    this.disposed = true;
    this.observer?.disconnect(); this.unsubscribe?.();
    this.app?.ticker.stop(); this.app?.ticker.remove(this.onTick);
    this.app?.destroy(true, { children: true }); this.app = undefined;
  }
}

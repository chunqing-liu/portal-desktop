import { Application, Container, Graphics, Text } from 'pixi.js';
import 'pixi.js/unsafe-eval';
import type { OfficePresence } from '../../../shared/office';
import type { OfficeRuntime } from './vendor/runtime/OfficeRuntime';
import { AgentEntity } from './vendor/scene/entities/AgentEntity';
import { createOfficePropViews, type PropView } from './vendor/scene/views/propViews';
import { projectAgents } from './vendor/runtime/adapters/legacy';
import { computeAgentDepthZ } from './vendor/scene/systems/deskDepthSort';
import { CELL_PIXELS } from './vendor/scene/gridProjection';
import { OfficeTextures } from './textures';

export class StarmapScene {
  private static applications = 0;
  private app?: Application;
  private textures?: OfficeTextures;
  private element?: HTMLElement;
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
  private maintenance?: ReturnType<typeof setTimeout>;
  private maintenanceTime = 0;
  private maintaining = false;
  private selected: string[] = [];
  private presence = new Map<string, OfficePresence>();
  private presenceSignature = '';
  constructor(private runtime: OfficeRuntime, private onActor: (id: string) => void, private onAdvance = () => {}) {}

  async mount(element: HTMLElement) {
    const app = new Application();
    await app.init({ width: Math.max(1, element.clientWidth), height: Math.max(1, element.clientHeight), backgroundColor: 0xece8dd, antialias: false, autoDensity: true, resolution: Math.min(devicePixelRatio || 1, 2), autoStart: false });
    if (this.disposed) { app.destroy(true, { children: true }); return; }
    this.app = app;
    StarmapScene.applications++;
    this.element = element;
    this.textures = new OfficeTextures(app.renderer);
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
    this.unsubscribe = this.runtime.subscribe(() => this.changed());
    this.sync(); resize();
    app.ticker.add(this.onTick);
    this.setActive(this.active);
  }

  private populate() {
    this.world.removeChildren().forEach(child => child.destroy({ children: true }));
    this.textures?.dispose();
    if (this.app) this.textures = new OfficeTextures(this.app.renderer);
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
    floor.cacheAsTexture({ resolution: 1 });
    const registry = createOfficePropViews(() => false);
    const agents = projectAgents(this.runtime, false);
    this.props = data.props.map(prop => {
      const view = registry.create(prop, this.runtime.template(prop.templateId));
      view.roots.forEach(item => { this.layer.addChild(item); item.cacheAsTexture({ resolution: 1 }); });
      view.update(prop, this.runtime.template(prop.templateId), agents);
      return view;
    });
    for (const agent of agents) {
      const entity = new AgentEntity(agent, false, (state, phase, color, seated) => this.textures!.actor(state, phase, color, seated));
      entity.on('pointertap', event => { event.stopPropagation(); this.onActor(agent.id); });
      this.entities.set(agent.id, entity);
      this.layer.addChild(entity);
      const label = new Text({ text: agent.currentTask || '待命', style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fill: 0x394b47 } });
      label.anchor.set(0.5, 0);
      label.zIndex = 10000;
      this.labels.set(agent.id, label);
      this.layer.addChild(label);
    }
    this.drawSelection();
  }
  refreshRoster() {
    if (this.app) { this.populate(); this.sync(); this.resize?.(); this.changed(); }
  }
  replaceRuntime(runtime: OfficeRuntime) {
    this.unsubscribe?.();
    this.runtime = runtime;
    if (this.app) {
      this.populate();
      this.unsubscribe = runtime.subscribe(() => this.changed());
      this.sync(); this.resize?.();
    }
  }
  setPresence(entries: OfficePresence[]) {
    this.presence = new Map(entries.map(entry => [entry.identity.id, entry]));
    const signature = JSON.stringify(entries.map(entry => [entry.identity.id, entry.expired, entry.disconnected, entry.status === 'offline', entry.expired || entry.disconnected || entry.status === 'offline' ? entry.lastSeen : 0]));
    if (signature !== this.presenceSignature) { this.presenceSignature = signature; this.changed(); }
  }
  private sync() {
    for (const agent of projectAgents(this.runtime, false)) {
      const entity = this.entities.get(agent.id);
      entity?.apply(agent);
      entity?.setPosition(agent.x, agent.y);
      const presence = this.presence.get(agent.id);
      const stale = presence && (presence.expired || presence.disconnected || presence.status === 'offline');
      if (entity) { entity.tint = stale ? 0x929292 : 0xffffff; entity.alpha = stale ? 0.55 : 1; }
      if (entity) entity.zIndex = computeAgentDepthZ(agent);
      const label = this.labels.get(agent.id);
      if (label) { label.text = (agent.currentTask || '待命') + (stale ? ' · 过期 · ' + new Date(presence!.lastSeen).toLocaleTimeString() : ''); label.position.set(agent.x, agent.y + 28); }
    }
  }
  private changed() {
    if (this.disposed) return;
    this.sync();
    const data = this.runtime.readWorld();
    const agents = projectAgents(this.runtime, false);
    this.props.forEach((view, index) => { view.update(data.props[index], this.runtime.template(data.props[index].templateId), agents); view.roots.forEach(item => item.updateCacheTexture()); });
    this.updateTicker();
    if (this.active && !this.app?.ticker.started) this.app?.render();
  }
  private diagnostics() {
    if (this.element) this.element.dataset.officeDiagnostics = JSON.stringify({ applications: StarmapScene.applications, tickerListeners: this.app?.ticker.count || 0, ticker: Boolean(this.app?.ticker.started), runtimeId: this.runtime.runtimeId, actors: this.entities.size, positionMismatches: projectAgents(this.runtime, false).filter(agent => { const entity = this.entities.get(agent.id); return !entity || entity.x !== agent.x || entity.y !== agent.y; }).length, textures: this.textures?.size || 0, listeners: this.runtime.listenerCount, sceneSubscriptions: this.unsubscribe ? 1 : 0, resizeObservers: this.observer ? 1 : 0, maintenance: this.maintenance !== undefined });
  }
  private updateTicker() {
    if (this.disposed) return;
    const animated = !this.reduced && this.runtime.readActors().some(actor => actor.presentation.status !== 'idle');
    if (this.active && (this.runtime.hasMotionWork || animated)) this.app?.ticker.start(); else this.app?.ticker.stop();
    this.diagnostics();
    if (!this.active && this.runtime.hasPendingSettlement && this.maintenance === undefined && !this.maintaining) {
      this.maintenanceTime = performance.now();
      this.maintenance = setTimeout(this.settleHidden, 33);
    }
  }
  private settleHidden = () => {
    const now = performance.now();
    this.maintenance = undefined;
    if (this.active || this.disposed || !this.runtime.hasPendingSettlement) return;
    this.maintaining = true;
    try { this.runtime.settleCancelled(now - this.maintenanceTime); this.maintenanceTime = now; this.onAdvance(); }
    finally { this.maintaining = false; }
    if (!this.active && !this.disposed && this.runtime.hasPendingSettlement) this.maintenance = setTimeout(this.settleHidden, 33);
  };
  private onTick = () => {
    if (!this.active || !this.app) return;
    this.runtime.tick(this.app.ticker.deltaMS);
    this.onAdvance();
    this.sync();
    this.entities.forEach(entity => entity.updateVisuals(entity.data.state, this.reduced ? 0 : this.app!.ticker.deltaMS / 1000));
    this.updateTicker();
  };
  setActive(active: boolean) {
    this.active = active;
    if (active && this.maintenance !== undefined) { clearTimeout(this.maintenance); this.maintenance = undefined; }
    this.updateTicker();
  }
  setReduced(reduced: boolean) { this.reduced = reduced; this.changed(); }
  select(ids: string[]) { this.selected = ids; this.drawSelection(); if (this.active) this.app?.render(); }
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
    if (this.maintenance !== undefined) clearTimeout(this.maintenance);
    this.maintenance = undefined;
    this.observer?.disconnect(); this.unsubscribe?.();
    this.app?.ticker.stop(); this.app?.ticker.remove(this.onTick);
    if (this.app) StarmapScene.applications--;
    this.app?.destroy(true, { children: true }); this.app = undefined;
    this.textures?.dispose(); this.textures = undefined;
    this.unsubscribe = undefined; this.observer = undefined; this.diagnostics();
  }
}

import { Graphics, Rectangle, type Renderer, type Texture } from 'pixi.js';
import { drawPixelActor } from './pixel-art';
import type { AgentState } from './vendor/types/agent';

export class OfficeTextures {
  private frames = new Map<string, Texture>();
  constructor(private renderer: Renderer) {}
  get size() { return this.frames.size; }
  actor(state: AgentState, phase: number, color: number, seated: boolean) {
    const frame = ['walking', 'working', 'thinking'].includes(state) ? Math.floor(phase) % 4 : 0;
    const key = [state, frame, color, seated].join(':');
    let texture = this.frames.get(key);
    if (!texture) {
      const graphic = new Graphics();
      drawPixelActor(graphic, state, frame, color, seated);
      texture = this.renderer.generateTexture({ target: graphic, frame: new Rectangle(-28, -44, 72, 64), resolution: 1 });
      texture.source.scaleMode = 'nearest';
      graphic.destroy();
      this.frames.set(key, texture);
    }
    return texture;
  }
  dispose() { this.frames.forEach(texture => texture.destroy(true)); this.frames.clear(); }
}

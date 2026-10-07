import type { FillGradient, Graphics } from 'pixi.js';
import type { AgentState } from './vendor/types/agent';

export function drawOfficeActor(graphic: Graphics, state: AgentState, phase: number, color: number, seated: boolean, facing: string, variation: number, gradient: (top: number, bottom: number) => FillGradient) {
  const frame = Math.floor(phase) % 4, sitting = seated && state !== 'walking';
  const darken = (ink: number, factor: number) => ((Math.round((ink >> 16 & 255) * factor) << 16) | (Math.round((ink >> 8 & 255) * factor) << 8) | Math.round((ink & 255) * factor));
  const skin = [0xe7bb96, 0xc79876, 0xf0ceaa, 0xad7b5e][variation % 4];
  const hair = [0x333b3c, 0x544a40, 0x3d3d40, 0x6a5946][variation % 4];
  const walk = state === 'walking' ? [-3, 0, 3, 0][frame] : 0;
  const headY = sitting ? -32 : -33 + (state === 'walking' && frame % 2 ? -1 : 0);
  const back = facing === 'back';
  graphic.clear();
  for (let ring = 5; ring > 0; ring--) graphic.ellipse(3, 12, 14 + ring, 3 + ring * .5).fill({ color: 0x35453f, alpha: .025 });
  if (sitting) {
    graphic.moveTo(-7, -1).quadraticCurveTo(-15, 2, -13, 10).moveTo(7, -1).quadraticCurveTo(15, 2, 13, 10).stroke({ color: 0x3f5058, width: 6 });
    graphic.roundRect(-18, 8, 9, 4, 2).fill(0x293c43); graphic.roundRect(9, 8, 9, 4, 2).fill(0x293c43);
  } else {
    graphic.moveTo(-6, -4).lineTo(-7 - walk, 10).moveTo(6, -4).lineTo(7 + walk, 10).stroke({ fill: gradient(0x57636b, 0x35434f), width: 6 });
    graphic.roundRect(-12 - walk, 9, 10, 4, 2).fill(0x29383f); graphic.roundRect(3 + walk, 9, 10, 4, 2).fill(0x29383f);
    graphic.moveTo(-10 - walk, 9).lineTo(-4 - walk, 9).moveTo(5 + walk, 9).lineTo(10 + walk, 9).stroke({ color: 0xc1c7c0, width: .9 });
  }
  graphic.roundRect(-10, -25, 20, sitting ? 25 : 24, 6).fill(gradient(color, darken(color, .72)));
  graphic.moveTo(-7, -23).quadraticCurveTo(-14, -17, -13 + walk * .4, sitting ? -12 : -4).stroke({ color: darken(color, .84), width: 6 });
  const raised = state === 'thinking';
  graphic.moveTo(7, -23).quadraticCurveTo(14, -17, raised ? 11 : 13 - walk * .4, raised ? -28 : sitting ? -12 - frame % 2 : -4).stroke({ color: color, width: 6 });
  graphic.circle(-13 + walk * .4, sitting ? -12 : -4, 2.7).fill(skin);
  graphic.circle(raised ? 11 : 13 - walk * .4, raised ? -28 : sitting ? -12 - frame % 2 : -4, 2.7).fill(skin);
  if (sitting && state === 'working') graphic.moveTo(-13, -12).lineTo(-5, -15 + frame % 2).moveTo(13, -12).lineTo(6, -15 - frame % 2).stroke({ color: skin, width: 3 });
  graphic.moveTo(-7, -22).quadraticCurveTo(0, -18, 7, -22).stroke({ color: 0xf1e8d7, alpha: .4, width: 1 });
  graphic.roundRect(-3, -29, 6, 6, 2).fill(gradient(skin, darken(skin, .83)));
  graphic.ellipse(0, headY, 8.5, 10).fill(gradient(skin, darken(skin, .89)));
  graphic.circle(-8, headY + 1, 2).fill(skin); graphic.circle(8, headY + 1, 2).fill(skin);
  if (back) {
    graphic.ellipse(0, headY - 2, 8.7, 8.4).fill(gradient(darken(hair, 1.16), hair));
    if (variation % 3 === 1) graphic.ellipse(-2, headY + 2, 9, 7).fill(hair);
    graphic.moveTo(-4, headY - 8).quadraticCurveTo(0, headY - 10, 5, headY - 6).stroke({ color: 0xffffff, alpha: .1, width: 1 });
  } else {
    graphic.ellipse(0, headY - 5, 8.4, 5.6).fill(gradient(darken(hair, 1.18), hair));
    graphic.poly([-8, headY - 4, 6, headY - 7, 8, headY - 1, 2, headY - 3, -6, headY - 1]).fill(hair);
    graphic.circle(-3, headY + 1, .9).fill(0x354348); graphic.circle(3.5, headY + 1, .9).fill(0x354348);
    graphic.moveTo(-2, headY + 5).quadraticCurveTo(0, headY + 6, 2, headY + 5).stroke({ color: 0x986e59, width: .7 });
    if (variation % 3 === 0) graphic.roundRect(-6, headY - 1, 5, 4, 1).stroke({ color: 0x536566, width: .7 }).roundRect(1, headY - 1, 5, 4, 1).stroke({ color: 0x536566, width: .7 });
  }
  if (variation % 3 === 2) {
    graphic.moveTo(-8, headY - 4).quadraticCurveTo(0, headY - 13, 8, headY - 4).stroke({ color: 0x526767, width: 2 });
    graphic.roundRect(-10, headY - 1, 3, 5, 1).fill(0x627b7d); graphic.roundRect(7, headY - 1, 3, 5, 1).fill(0x627b7d);
  }
  if (state === 'thinking') for (let dot = 0; dot < 3; dot++) graphic.circle(17 + dot * 4, headY - 6 - dot * 3, 1.3).fill({ color: 0x708e8d, alpha: dot <= frame ? .9 : .25 });
}

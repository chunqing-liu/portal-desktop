import type { FillGradient, Graphics } from 'pixi.js';
import type { AgentState } from './vendor/types/agent';
import type { InteractionAction } from './leisure';

export function drawOfficeActor(graphic: Graphics, state: AgentState, phase: number, color: number, seated: boolean, facing: string, variation: number, gradient: (top: number, bottom: number) => FillGradient, activity?: InteractionAction) {
  const frame = Math.floor(phase) % 4, sitting = seated && state !== 'walking';
  const darken = (ink: number, factor: number) => ((Math.round((ink >> 16 & 255) * factor) << 16) | (Math.round((ink >> 8 & 255) * factor) << 8) | Math.round((ink & 255) * factor));
  const skin = [0xe7bb96, 0xc79876, 0xf0ceaa, 0xad7b5e][variation % 4];
  const hair = [0x333b3c, 0x544a40, 0x3d3d40, 0x6a5946][variation % 4];
  const walk = state === 'walking' ? [-3, 0, 3, 0][frame] : 0;
  const headY = sitting ? -32 : -33 + (state === 'walking' && frame % 2 ? -1 : 0);
  const back = facing === 'back';
  const profile = facing === 'left' ? -1 : facing === 'right' ? 1 : 0;
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
  graphic.moveTo(-7, -23).quadraticCurveTo(-14, -17, activity === 'exercise' ? -17 : -13 + walk * .4, activity === 'exercise' ? -31 - frame * 2 : sitting ? -12 : -4).stroke({ color: darken(color, .84), width: 6 });
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
    graphic.circle(-3 + profile * 2.5, headY + 1, .9).fill(0x354348); graphic.circle(3.5 + profile * 2, headY + 1, .9).fill(0x354348);
    graphic.moveTo(-2 + profile * 2, headY + 5).quadraticCurveTo(profile * 2, headY + 6, 2 + profile * 2, headY + 5).stroke({ color: 0x986e59, width: .7 });
    if (profile) graphic.moveTo(profile * 5, headY + 1).lineTo(profile * 9, headY + 3).lineTo(profile * 5, headY + 4).fill(skin);
    if (variation % 3 === 0) graphic.roundRect(-6, headY - 1, 5, 4, 1).stroke({ color: 0x536566, width: .7 }).roundRect(1, headY - 1, 5, 4, 1).stroke({ color: 0x536566, width: .7 });
  }
  if (variation % 3 === 2) {
    graphic.moveTo(-8, headY - 4).quadraticCurveTo(0, headY - 13, 8, headY - 4).stroke({ color: 0x526767, width: 2 });
    graphic.roundRect(-10, headY - 1, 3, 5, 1).fill(0x627b7d); graphic.roundRect(7, headY - 1, 3, 5, 1).fill(0x627b7d);
  }
  if (activity === 'listen') graphic.moveTo(-4, headY - 4 + frame % 2).lineTo(4, headY - 4 + frame % 2).stroke({ color: hair, width: 2 });
  if (activity === 'phone') {
    graphic.moveTo(10, -20).lineTo(7, -13).stroke({ color: skin, width: 3 });
    graphic.roundRect(3, -21, 8, 12, 2).fill(0x263b51);
    graphic.roundRect(4.5, -19, 5, 8, 1).fill(frame % 2 ? 0xa5d9ed : 0xc3ebf5);
    graphic.circle(7, -10, .6).fill(0xffffff);
  } else if (activity === 'brew') {
    graphic.moveTo(10, -22).lineTo(18, -39 - frame % 2 * 4).stroke({ color: skin, width: 3.5 });
    graphic.circle(18, -39 - frame % 2 * 4, 2.5).fill(skin);
  } else if (activity === 'present' || activity === 'wander') {
    graphic.moveTo(10, -22).lineTo(20, -36 - frame % 2 * 3).stroke({ color: skin, width: 3.5 });
    graphic.moveTo(20, -36 - frame % 2 * 3).lineTo(25, -41 - frame % 2 * 3).stroke({ color: 0x3f6685, width: 1.8 });
  } else if (activity === 'coffee') {
    const cupY = frame === 2 ? -29 : -16;
    graphic.moveTo(11, -21).lineTo(12, cupY + 3).stroke({ color: skin, width: 3 });
    graphic.roundRect(8, cupY, 9, 8, 2).fill(0xf7fbff);
    graphic.ellipse(12.5, cupY, 4.5, 1.6).fill(0x846c57);
    graphic.ellipse(18, cupY + 3, 2, 2).stroke({ color: 0xc1d0df, width: 1.3 });
    graphic.moveTo(12, cupY - 3).quadraticCurveTo(15, cupY - 6, 12, cupY - 8).stroke({ color: 0xa7b9c7, alpha: .5, width: 1 });
  } else if (activity === 'read') {
    graphic.moveTo(-12, -10).lineTo(-6, -15).moveTo(12, -10).lineTo(6, -15).stroke({ color: skin, width: 3 });
    graphic.poly([-10, -19, 0, -16, 10, -19, 10, -8, 0, -5, -10, -8]).fill(0x6d87d4);
    graphic.poly([-9, -18, 0, -15, 9, -18, 9, -10, 0, -7, -9, -10]).fill(0xf9faf5);
    graphic.moveTo(0, -15).lineTo(0, -7).stroke({ color: 0xaab5c4, width: .8 });
    if (frame === 2) graphic.poly([0, -15, 6, -20, 7, -11, 0, -7]).fill(0xdce6e7);
  } else if (activity === 'exercise') {
    const lift = [0, 6, 11, 6][frame];
    graphic.moveTo(-14, -26).lineTo(-17, -31 - lift).moveTo(11, -18).lineTo(17, -31 - lift).stroke({ color: skin, width: 3 });
    for (const handX of [-17, 17]) {
      graphic.moveTo(handX - 4, -31 - lift).lineTo(handX + 4, -31 - lift).stroke({ color: 0x748ba9, width: 2 });
      graphic.roundRect(handX - 6, -34 - lift, 3, 6, 1).fill(0x5f7294); graphic.roundRect(handX + 3, -34 - lift, 3, 6, 1).fill(0x5f7294);
    }
  }
}

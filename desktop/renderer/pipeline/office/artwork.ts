import { Container, FillGradient, Graphics, Rectangle, Text } from 'pixi.js';
import type { Prop } from './vendor/runtime/model';
import type { PropView } from './vendor/scene/views/propViews';
import { propPixels, CELL_PIXELS } from './vendor/scene/gridProjection';
import { computeChairLayerZ, computeDeskLayerZ } from './vendor/scene/systems/deskDepthSort';
import type { OfficeRole } from './roles';

export class OfficeArtwork {
  private gradients = new Map<string, FillGradient>();
  gradient(top: number, bottom: number, horizontal = false) {
    const key = [top, bottom, horizontal].join(':');
    let fill = this.gradients.get(key);
    if (!fill) {
      fill = new FillGradient({ start: { x: 0, y: 0 }, end: { x: horizontal ? 1 : 0, y: horizontal ? 0 : 1 }, colorStops: [{ offset: 0, color: top }, { offset: 1, color: bottom }] });
      this.gradients.set(key, fill);
    }
    return fill;
  }
  shadow(graphic: Graphics, centerX: number, centerY: number, radiusX: number, radiusY: number, strength = .13) {
    for (let ring = 7; ring > 0; ring--) graphic.ellipse(centerX, centerY, radiusX * (1 + ring * .06), radiusY * (1 + ring * .09)).fill({ color: 0x323c39, alpha: strength / 7 });
  }
  plant(graphic: Graphics, centerX: number, centerY: number, size = 1) {
    this.shadow(graphic, centerX + 4, centerY + 5, 19 * size, 5 * size);
    graphic.poly([centerX - 12 * size, centerY - 19 * size, centerX + 12 * size, centerY - 19 * size, centerX + 9 * size, centerY + 3 * size, centerX - 9 * size, centerY + 3 * size]).fill(this.gradient(0xc9bb9d, 0x918770));
    graphic.ellipse(centerX, centerY - 19 * size, 12 * size, 4 * size).fill(0x5a6050);
    for (let leaf = 0; leaf < 9; leaf++) {
      const angle = leaf * 2.4, reach = (17 + leaf % 3 * 5) * size;
      const tipX = centerX + Math.sin(angle) * reach, tipY = centerY - (37 + leaf % 4 * 8) * size;
      graphic.moveTo(centerX, centerY - 18 * size).quadraticCurveTo(centerX + Math.sin(angle) * 8 * size, tipY + 9 * size, tipX, tipY).stroke({ color: 0x57745c, width: 1.4 * size });
      graphic.ellipse(tipX, tipY, 7 * size, 11 * size).fill(leaf % 2 ? this.gradient(0x839775, 0x4b7056) : this.gradient(0x617e64, 0x365948));
      graphic.moveTo(tipX, tipY + 6 * size).lineTo(tipX, tipY - 5 * size).stroke({ color: 0xb4c4a2, alpha: .25, width: .6 * size });
    }
  }
  room(width: number, height: number, count: number) {
    const root = new Container(), graphic = new Graphics();
    root.addChild(graphic);
    this.shadow(graphic, width / 2, height - 4, width * .46, 15, .12);
    graphic.roundRect(12, 12, width - 24, height - 28, 12).fill(this.gradient(0xe9e5d9, 0xc8b295));
    graphic.poly([12, 110, width - 12, 110, width - 24, height - 29, 24, height - 29]).fill(this.gradient(0xcbbca4, 0xd8c4a8));
    for (let board = 0, floorY = 110; floorY < height - 29; floorY += 20, board++) {
      graphic.moveTo(22, floorY).lineTo(width - 22, floorY).stroke({ color: 0x9f8a6f, width: .7, alpha: .23 });
      for (let floorX = 22 + board % 3 * 63; floorX < width - 24; floorX += 190) {
        graphic.moveTo(floorX, floorY).lineTo(floorX, Math.min(height - 29, floorY + 20)).stroke({ color: 0x8b795f, width: .6, alpha: .18 });
        graphic.moveTo(floorX + 7, floorY + 7).lineTo(Math.min(floorX + 128, width - 24), floorY + 7).stroke({ color: 0xf7ecda, width: .7, alpha: .16 });
        graphic.moveTo(floorX + 19, floorY + 14).lineTo(Math.min(floorX + 153, width - 24), floorY + 14).stroke({ color: 0x9d866c, width: .5, alpha: .12 });
      }
    }
    graphic.poly([12, 12, width - 12, 12, width - 12, 112, 12, 112]).fill(this.gradient(0xf6f4ed, 0xd7d8cd));
    graphic.poly([12, 12, 32, 35, 32, height - 34, 12, height - 50]).fill(this.gradient(0xe5e4d9, 0xb9b8ab, true));
    graphic.poly([width - 12, 12, width - 30, 35, width - 30, height - 34, width - 12, height - 50]).fill(this.gradient(0xb3b6a8, 0xe0ddce, true));
    graphic.rect(32, 110, width - 62, 7).fill(this.gradient(0xa5a799, 0xd8d5c8));
    graphic.moveTo(32, 118).lineTo(width - 30, 118).stroke({ color: 0x7a8075, width: 1, alpha: .35 });
    const windowCount = Math.max(1, Math.floor((width - 215) / 180));
    const windowWidth = Math.min(164, (width - 230) / windowCount);
    for (let windowIndex = 0; windowIndex < windowCount; windowIndex++) {
      const windowX = 58 + windowIndex * (windowWidth + 26);
      graphic.roundRect(windowX - 5, 25, windowWidth + 10, 76, 2).fill(0xb7c2b8);
      graphic.rect(windowX, 30, windowWidth, 64).fill(this.gradient(0xb4d0d5, 0xf0f2df));
      for (let building = 0; building < 6; building++) {
        const buildingX = windowX + 4 + building * windowWidth / 6, buildingHeight = 9 + building * 13 % 26;
        graphic.rect(buildingX, 92 - buildingHeight, windowWidth / 6 - 3, buildingHeight).fill({ color: building % 2 ? 0x97b3b1 : 0xc2d0c0, alpha: .6 });
      }
      graphic.poly([windowX, 30, windowX + 47, 30, windowX + 13, 94, windowX, 94]).fill({ color: 0xffffff, alpha: .18 });
      graphic.rect(windowX + windowWidth / 2 - 1.5, 30, 3, 64).fill(0xf3f0e6);
      graphic.rect(windowX, 59, windowWidth, 2).fill({ color: 0xfffdf1, alpha: .8 });
      graphic.rect(windowX - 7, 95, windowWidth + 14, 5).fill(this.gradient(0xfaf8ef, 0xc1c2b4));
      graphic.poly([windowX + 3, 119, windowX + windowWidth - 3, 119, windowX + windowWidth + 75, Math.min(height - 40, 325), windowX + 43, Math.min(height - 40, 325)]).fill({ color: 0xfff8df, alpha: .17 });
      for (let pane = 0; pane < 2; pane++) graphic.poly([windowX + 6 + pane * windowWidth / 2, 122, windowX + windowWidth / 2 - 4 + pane * windowWidth / 2, 122, windowX + windowWidth / 2 + 62 + pane * windowWidth / 2, Math.min(height - 44, 303), windowX + 48 + pane * windowWidth / 2, Math.min(height - 44, 303)]).fill({ color: 0xffffff, alpha: .08 });
    }
    graphic.poly([24, height - 29, width - 24, height - 29, width - 12, height - 19, 12, height - 19]).fill(this.gradient(0xb4a38a, 0x8b7b66));
    graphic.moveTo(24, height - 29).lineTo(width - 24, height - 29).stroke({ color: 0xf1e4ce, width: 2 });
    graphic.poly([12, height - 120, 32, height - 98, 32, height - 60, 12, height - 78]).fill(this.gradient(0x7d8e80, 0x586e64));
    graphic.moveTo(15, height - 116).lineTo(29, height - 100).lineTo(29, height - 63).stroke({ color: 0xc0cbbb, width: 1 });
    graphic.circle(27, height - 82, 1.6).fill(0xd9d4bd);
    this.plant(graphic, 51, 202, .8);
    this.plant(graphic, width - 54, height - 66, .9);
    const rugWidth = Math.min(width - 130, 335);
    graphic.roundRect((width - rugWidth) / 2, height - 94, rugWidth, 47, 9).fill({ color: 0x9aa89c, alpha: .34 });
    for (let stitch = 0; stitch < rugWidth; stitch += 8) graphic.moveTo((width - rugWidth) / 2 + stitch, height - 86).lineTo((width - rugWidth) / 2 + stitch, height - 56).stroke({ color: 0xe1e2cf, alpha: .28, width: .7 });
    const title = new Text({ text: count ? '工作室  /  ' + String(count).padStart(2, '0') : '工作室  /  等待伙伴上线', style: { fontFamily: 'system-ui, sans-serif', fontSize: 10, letterSpacing: 2, fill: 0x626d63 } });
    title.position.set(48, 14); root.addChild(title);
    return root;
  }
  screen(graphic: Graphics, centerX: number, centerY: number, width: number, height: number, role: OfficeRole) {
    this.shadow(graphic, centerX + 2, centerY + height / 2 + 7, width * .35, 3, .14);
    graphic.roundRect(centerX - 9, centerY + height / 2 + 2, 18, 4, 2).fill(this.gradient(0x9daba6, 0x536461));
    graphic.rect(centerX - 2, centerY + height / 2 - 3, 4, 7).fill(0x83958f);
    graphic.roundRect(centerX - width / 2, centerY - height / 2, width, height, 3).fill(this.gradient(0x536568, 0x233b3e));
    graphic.roundRect(centerX - width / 2 + 2.5, centerY - height / 2 + 2.5, width - 5, height - 6, 1.5).fill(this.gradient(0x203f49, 0x38575b));
    const left = centerX - width / 2 + 5, top = centerY - height / 2 + 6;
    graphic.moveTo(left, top).lineTo(left + width - 10, top).stroke({ color: 0xa4c4c0, width: 1, alpha: .5 });
    if (role === 'engine') {
      const cubeX = centerX + 9, cubeY = centerY + 2;
      graphic.poly([cubeX, cubeY - 9, cubeX + 12, cubeY - 3, cubeX, cubeY + 3, cubeX - 12, cubeY - 3]).fill(0x79aaa6).stroke({ color: 0xc1e0c8, width: .8 });
      graphic.poly([cubeX - 12, cubeY - 3, cubeX, cubeY + 3, cubeX, cubeY + 14, cubeX - 12, cubeY + 7]).fill(0x3e706f).stroke({ color: 0x9bc6af, width: .7 });
      graphic.poly([cubeX, cubeY + 3, cubeX + 12, cubeY - 3, cubeX + 12, cubeY + 7, cubeX, cubeY + 14]).fill(0x517f77).stroke({ color: 0x9bc6af, width: .7 });
      for (let tool = 0; tool < 5; tool++) graphic.rect(left, top + 5 + tool * 4, 6, 2).fill({ color: 0xa5cac5, alpha: .5 });
    } else if (role === 'frontend' || role === 'product') {
      graphic.roundRect(left + 1, top + 4, width - 13, height - 15, 1).fill(this.gradient(0xedeee1, 0xc1d6cb));
      graphic.rect(left + 4, top + 7, width - 20, 3).fill(0x5f8c81);
      graphic.roundRect(left + 4, top + 13, (width - 20) * .55, height - 28, 1).fill(0xa4bbb1);
      graphic.rect(left + width * .58, top + 13, Math.max(2, width * .24), 2).fill(0x75978a);
      graphic.rect(left + width * .58, top + 18, Math.max(2, width * .19), 2).fill(0x90ab9d);
    } else {
      for (let row = 0; row < 6; row++) {
        graphic.rect(left, top + 5 + row * 4, 2, 1.2).fill(0x72b8a6);
        graphic.rect(left + 5 + row % 2 * 3, top + 5 + row * 4, Math.max(3, (width - 22) * (.3 + row % 3 * .19)), 1.2).fill(row % 3 ? 0xb3cfbc : 0xc4aa80);
      }
      if (role === 'test') graphic.circle(centerX + width / 3, centerY + height / 3, 3).fill(0x96c6a4);
    }
    graphic.poly([centerX - width / 2 + 3, centerY - height / 2 + 3, centerX - width / 4, centerY - height / 2 + 3, centerX - width / 2 + 3, centerY + height / 3]).fill({ color: 0xffffff, alpha: .07 });
    graphic.circle(centerX + width / 2 - 5, centerY + height / 2 - 2, .7).fill(0x9cd0b0);
  }
  whiteboard(prop: Prop): PropView {
    const root = new Container(), graphic = new Graphics();
    graphic.roundRect(-62, -71, 125, 67, 4).fill({ color: 0x667467, alpha: .13 });
    graphic.roundRect(-66, -77, 124, 67, 3).fill(this.gradient(0xb7bfb3, 0x838f85));
    graphic.roundRect(-63, -74, 118, 61, 2).fill(this.gradient(0xfcfcf1, 0xe1e6d8));
    graphic.moveTo(-56, -55).lineTo(46, -55).stroke({ color: 0xc4cfc1, width: .8 });
    for (let note = 0; note < 3; note++) {
      graphic.rect(-53 + note * 32, -47, 24, 20).fill([0xe2d1a5, 0xb6d0bf, 0xc5ced4][note]);
      for (let line = 0; line < 3; line++) graphic.moveTo(-49 + note * 32, -42 + line * 4).lineTo(-36 + note * 32 - line % 2 * 5, -42 + line * 4).stroke({ color: 0x657c70, width: .8, alpha: .6 });
    }
    graphic.rect(-68, -12, 128, 3).fill(this.gradient(0x8a9c93, 0x5f776e));
    graphic.rect(-47, -14, 15, 2).fill(0x637f88);
    const label = new Text({ text: '工作备忘', style: { fontFamily: 'system-ui', fontSize: 8, letterSpacing: 1, fill: 0x65776b } });
    label.position.set(-53, -69); root.addChild(graphic, label);
    return { roots: [root], hitTarget: root, update(current) { const pixel = propPixels(current); root.position.set(pixel.x, pixel.y + 32); root.zIndex = pixel.y - 100; } };
  }
  dispose() { this.gradients.forEach(gradient => gradient.destroy()); this.gradients.clear(); }
  workstation(prop: Prop): PropView {
    const shadow = new Graphics(), desk = new Graphics(), chair = new Graphics();
    const role = String(prop.state.role || 'general') as OfficeRole;
    this.shadow(shadow, 8, 69, 75, 13, .14);
    desk.moveTo(-56, 12).lineTo(-53, 61).moveTo(56, 12).lineTo(53, 61).stroke({ color: 0x3e4c4c, width: 5 });
    desk.moveTo(-53, 20).lineTo(51, 20).stroke({ color: 0x677373, width: 3 });
    desk.moveTo(-58, 61).lineTo(-44, 61).moveTo(47, 61).lineTo(61, 61).stroke({ color: 0x303f40, width: 3 });
    desk.roundRect(37, 23, 24, 33, 2).fill(this.gradient(0xded5c0, 0xada58e));
    desk.moveTo(39, 39).lineTo(59, 39).stroke({ color: 0x918974, width: 1 });
    desk.roundRect(44, 28, 11, 2, 1).fill(0x797c70);
    desk.poly([-72, -15, 62, -15, 75, 19, -64, 19]).fill(this.gradient(0xdfc7a2, 0xb79569));
    desk.poly([-64, 19, 75, 19, 75, 25, -64, 25]).fill(this.gradient(0xb08f64, 0x8c704e));
    desk.moveTo(-71, -14).lineTo(61, -14).lineTo(74, 18).lineTo(-63, 18).stroke({ color: 0xf9e6c8, width: 1, alpha: .65 });
    for (let grain = 0; grain < 6; grain++) desk.moveTo(-57 + grain % 2 * 9, -9 + grain * 4).lineTo(56 + grain % 3 * 2, -9 + grain * 4).stroke({ color: grain % 2 ? 0x866344 : 0xfff1d8, width: .5, alpha: .18 });
    desk.poly([-45, -8, 27, -8, 35, 16, -41, 16]).fill({ color: 0x485857, alpha: .38 });
    desk.moveTo(-6, -3).bezierCurveTo(9, 6, 24, -3, 25, 17).lineTo(26, 36).stroke({ color: 0x53605c, width: 1.1, alpha: .7 });
    this.screen(desk, -10, -34, 65, 40, role);
    if (role === 'engine' || role === 'frontend') this.screen(desk, 40, -29, 31, 32, role === 'engine' ? 'backend' : 'frontend');
    desk.poly([-24, 3, 17, 3, 23, 13, -23, 13]).fill(this.gradient(0xe8e8df, 0x9faaa2));
    for (let row = 0; row < 3; row++) for (let key = 0; key < 10; key++) desk.roundRect(-20 + key * 3.7 + row * .5, 4 + row * 2.4, 2.8, 1.7, .3).fill(0x677572);
    desk.ellipse(33, 9, 4, 6).fill(this.gradient(0xe7e8e0, 0xa3aea6));
    desk.moveTo(33, 4).lineTo(33, 7).stroke({ color: 0x85928a, width: .6 });
    desk.ellipse(-49, 10, 8, 3).fill({ color: 0x685f4e, alpha: .13 });
    desk.roundRect(-56, -3, 11, 12, 2).fill(this.gradient(0xf3eee2, 0xb4b8a9));
    desk.ellipse(-50.5, -3, 5.5, 2).fill(0x5d5145);
    desk.ellipse(-43.5, 2, 3, 3).stroke({ color: 0xcbcec0, width: 1.8 });
    desk.poly([48, 3, 63, 3, 66, 13, 50, 13]).fill(0xe4dbc5);
    desk.moveTo(52, 6).lineTo(60, 6).moveTo(53, 9).lineTo(62, 9).stroke({ color: 0x9caa9b, width: .7 });
    desk.moveTo(56, 3).lineTo(63, 12).stroke({ color: 0x6d807d, width: 1.1 });
    if (role === 'backend' || role === 'engine') {
      desk.roundRect(-67, -12, 10, 23, 1.5).fill(this.gradient(0x5d6a68, 0x303f40));
      for (let vent = 0; vent < 4; vent++) desk.moveTo(-65, -8 + vent * 3).lineTo(-59, -8 + vent * 3).stroke({ color: 0x9ba8a1, width: .7 });
      desk.circle(-62, 6, 1.1).fill(0x96c7ae);
    }
    this.shadow(chair, 3, 72, 19, 5, .14);
    chair.moveTo(0, 53).lineTo(0, 70).moveTo(0, 68).lineTo(-17, 73).moveTo(0, 68).lineTo(17, 73).moveTo(0, 68).lineTo(3, 78).stroke({ color: 0x556263, width: 3 });
    for (const [wheelX, wheelY] of [[-17, 73], [17, 73], [3, 78]]) chair.roundRect(wheelX - 3, wheelY - 1, 6, 3, 1).fill(0x344344);
    chair.roundRect(-21, 36, 42, 13, 6).fill(this.gradient(0x697e78, 0x3e5953));
    chair.moveTo(-22, 34).lineTo(-22, 47).moveTo(22, 34).lineTo(22, 47).stroke({ color: 0x3d5050, width: 2 });
    chair.roundRect(-20, 28, 40, 22, 7).fill(this.gradient(0x788e86, 0x445e58));
    chair.roundRect(-17, 31, 34, 15, 5).stroke({ color: 0x9cad9f, alpha: .36, width: .8 });
    for (let mesh = 0; mesh < 5; mesh++) chair.moveTo(-13, 33 + mesh * 2.6).lineTo(13, 33 + mesh * 2.6).stroke({ color: 0x263f3b, alpha: .18, width: .6 });
    return { roots: [shadow, desk, chair], hitTarget: desk, update(current, _template, agents) {
      const pixel = propPixels(current), station = { id: current.id, ...pixel, seatX: pixel.x, seatY: pixel.y + 45 };
      shadow.position.set(pixel.x, pixel.y); shadow.zIndex = pixel.y - 110;
      desk.position.set(pixel.x, pixel.y); desk.zIndex = computeDeskLayerZ(station, agents);
      chair.position.set(pixel.x, pixel.y); chair.zIndex = computeChairLayerZ(station, agents);
      desk.hitArea = new Rectangle(-75, -59, 150, 125);
    } };
  }
}

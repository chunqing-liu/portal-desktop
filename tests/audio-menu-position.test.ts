import {expect,it} from 'vitest';
import {audioMenuPosition} from '../desktop/renderer/chat/services/audio-menu-position';
it('anchors above the clicked button and follows a second button',()=>{
 const viewport={width:1000,height:800};
 const first=audioMenuPosition({top:500,bottom:526,right:900},viewport);
 const second=audioMenuPosition({top:600,bottom:626,right:800},viewport);
 expect(first).toMatchObject({left:675,top:296,submenuLeft:-228});
 expect(second.left-first.left).toBe(-100);expect(second.top-first.top).toBe(100);
});
it('flips below a top-edge button and keeps both menus within the viewport',()=>{
 const p=audioMenuPosition({top:20,bottom:46,right:250},{width:1000,height:800});
 expect(p.top).toBe(54);expect(p.submenuLeft).toBe(233);
 expect(p.left+p.submenuLeft).toBeGreaterThanOrEqual(12);
 expect(p.left+p.submenuLeft+p.submenuWidth).toBeLessThanOrEqual(988);
});
it('clamps the submenu at the bottom edge without moving the parent',()=>{
 const p=audioMenuPosition({top:760,bottom:786,right:900},{width:1000,height:800});
 expect(p.top).toBe(556);expect(p.top+p.submenuTop+236).toBeLessThanOrEqual(788);
});

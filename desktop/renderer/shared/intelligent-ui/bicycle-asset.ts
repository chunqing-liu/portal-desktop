import type { Shape } from './runtime';
// Shared geometry keeps the assembled joints coincident. Offsets only apply during disassembly.
const shapes: Shape[] = [];
function path(part: string, d: string, strokeWidth: number, dx = 0, dy = 0) { shapes.push({type:'path',part,d,strokeWidth,dx,dy,color:'text'}); }
function circle(part: string, x: number, y: number, r: number, strokeWidth: number, dx = 0, dy = 0) { shapes.push({type:'circle',part,x,y,r,strokeWidth,dx,dy,color:'text'}); }
for (const [x, dx] of [[200,-46],[650,46]]) {
  circle('wheels',x,330,104,12,dx,25);
  circle('wheels',x,330,95,2,dx,25);
  for(let i=0;i<28;i++) {
    const a=i*Math.PI/14;
    shapes.push({type:'line',part:'wheels',x,y:330,x2:x+Math.cos(a)*94,y2:330+Math.sin(a)*94,strokeWidth:.85,dx,dy:25,color:'text'});
  }
  circle('wheels',x,330,7,2,dx,25);
}
// Rear triangle, front triangle, head tube and fork share exact attachment points.
path('frame','M200 330 L326 170 L384 330 Z',7,0,-12);
path('frame','M326 170 L555 151 L568 194 L384 330 Z',15,0,-12);
path('frame','M552 143 L570 201',18,0,-12);
path('cockpit','M563 173 L583 223 L650 330',10,24,-35);
path('cockpit','M326 170 L305 111',7,-8,-55);
path('cockpit','M263 104 Q296 111 326 105',15,-8,-55);
path('cockpit','M558 152 L545 108 L570 96',8,24,-35);
path('cockpit','M536 84 L574 98 L628 80',7,24,-35);
path('cockpit','M531 81 L549 89 M609 86 L630 79',12,24,-35);
// Seven sprockets and a continuous chain loop, crank arms, pedals and derailleur.
for (let i=0;i<7;i++) circle('drive',200,330,10+i*2.4,1.3,0,58);
circle('drive',384,330,32,6,0,58);circle('drive',384,330,25,2,0,58);
path('drive','M200 307 L384 298 A32 32 0 0 1 389 362 L209 381 Q193 380 197 368 L209 351 A24 24 0 0 1 200 307',2.5,0,58);
path('drive','M205 347 L194 363 L214 381 M203 354 L219 358 L224 370',4,0,58);
circle('drive',214,378,5,2,0,58);
path('drive','M354 291 L414 369',7,0,58);
path('drive','M340 290 L365 290 M404 371 L430 371',8,0,58);
// Rim brakes and cable routing.
path('brakes','M259 231 L275 225 L289 242 M605 232 L620 226 L633 242',4,0,-22);
path('brakes','M260 233 L264 246 M284 238 L288 249 M607 234 L611 247 M628 239 L632 249',5,0,-22);
path('brakes','M532 93 Q515 153 355 156 L275 225 M634 99 Q674 160 620 226',1.3,0,-22);
path('brakes','M529 100 L518 109 M637 115 L651 124',4,0,-22);
export const bicycleAsset = {
  width: 850, height: 520, shapes,
  parts: [
    {id:'frame',label:'车架',description:'前后三角构成整车的骨架，连接车轮、座管和前叉，将骑行者的重量传递到车轮。'},
    {id:'wheels',label:'车轮',description:'轮胎接触路面；轮圈、辐条和轮毂共同承受重量。细辐条受拉，让车轮保持轻盈而坚固。'},
    {id:'drive',label:'传动',description:'脚踏通过曲柄转动牙盘，链条驱动后轮上的七级飞轮。后拨链器引导链条换挡，并维持张力。'},
    {id:'brakes',label:'刹车',description:'握紧刹把，拉线牵引制动夹器，使刹车块压向轮圈，利用摩擦降低车速。'},
    {id:'cockpit',label:'转向与支撑',description:'车把通过把立与前叉控制方向，车座和座管支撑骑行者。拖动滑块可以观察它们的装配关系。'},
  ],
};

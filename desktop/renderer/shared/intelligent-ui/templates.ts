import { wardrobe, roadtrip, retirement, gdp, clt, monty, photography, itemizedBill, arcade } from './scenarios';
import type { UIDocument, Expr } from './runtime';
const state = (key: string): Expr => ({ state: key });
const op = (name: string, ...args: Expr[]): Expr => ({ op: name, args });
export const bicycle: UIDocument = {
  version: 1, title: '七速自行车 · 从整体到部件', state: { part: 'all', explode: 0 }, body: [
    { id: 'bike', type: 'diagram', asset: 'bicycle', label: '五个系统，协同前进', bind: 'part', explodeBind: 'explode' },
    { id: 'follow', type: 'button', label: '继续了解这个部件', action: 'continue', value: '请进一步解释我选中的自行车部件，并举一个骑行中的例子。' },
  ],
};
const mealFactor = op('if', op('eq', state('appetite'), '轻食'), .8, op('if', op('eq', state('appetite'), '丰盛'), 1.25, 1));
const mealAmount = (grams: number) => op('concat', op('round', op('mul', state('guests'), grams, mealFactor)), ' 克');
export const meal: UIDocument = {
  version: 1, title: '把周末，留给一桌好菜', state: { guests: 6, appetite: '标准' }, body: [
    { id: 'intro', type: 'hero', label: '把周末，留给一桌好菜', meta: 'WEEKEND TABLE · 18:00 开席', value: '柠檬香草烤鸡、金黄土豆和清爽时蔬。提前做好准备，留出和朋友聊天的时间。' },
    { id: 'summary', type: 'grid', variant: 'three', children: [
      { id: 'people', type: 'metric', label: '聚餐人数', value: state('guests'), unit: '人', appearance: { surface: 'soft', size: 'small' } },
      { id: 'meat', type: 'metric', label: '鸡肉采购量', value: op('fixed', op('mul', state('guests'), .25, mealFactor), 2), unit: 'kg', appearance: { surface: 'soft', size: 'small' } },
      { id: 'duration', type: 'metric', label: '预留聚餐时间', value: 2, unit: '小时', appearance: { surface: 'soft', size: 'small' } },
    ] },
    { id: 'controls', type: 'card', label: '定制这一餐', children: [
      { id: 'guests', type: 'stepper', label: '用餐人数', bind: 'guests', min: 1, max: 20, range: true },
      { id: 'appetite', type: 'segmented', label: '大家的食量', bind: 'appetite', options: ['轻食', '标准', '丰盛'], variant: 'quiet' },
      { id: 'control-note', type: 'text', value: '人数与食量改变后，下方采购量会同步更新。数量为准备食材的示例估算。', appearance: { size: 'small', emphasis: 'muted' } },
    ] },
    { id: 'menu', type: 'section', label: '今晚的招牌菜单', children: [
      { id: 'menu-grid', type: 'grid', children: [
        { id: 'main', type: 'media', label: '柠檬香草烤鸡', value: '主菜 · 迷迭香、烤蒜与肉汁，整盘上桌分享。' },
        { id: 'side', type: 'media', label: '迷迭香烤土豆', value: '配菜 · 金黄酥脆，搭配主菜肉汁。' },
        { id: 'veg', type: 'media', label: '时蔬与绿叶沙拉', value: '配菜 · 当季蔬菜，临上桌再拌汁。' },
        { id: 'dessert', type: 'media', label: '水果与热茶', value: '收尾 · 一盘时令水果，配一壶茶。' },
      ] },
    ] },
    { id: 'shopping', type: 'checklist', label: '采购清单', description: '数量随人数和食量联动 · 点击勾选已购买', copyable: true, appearance: { surface: 'outline' }, items: [
      { id: 'chicken', label: '鸡肉', group: '主菜', description: '柠檬香草烤鸡', value: mealAmount(250) },
      { id: 'potatoes', label: '土豆', group: '配菜与水果', description: '迷迭香烤土豆', value: mealAmount(200) },
      { id: 'vegetables', label: '当季蔬菜', group: '配菜与水果', value: mealAmount(150) },
      { id: 'fruit', label: '时令水果', group: '配菜与水果', value: mealAmount(100) },
      { id: 'pantry', label: '调味与香料', group: '厨房常备', description: '柠檬、蒜、迷迭香、橄榄油、盐和黑胡椒', value: '按库存补齐' },
    ] },
    { id: 'steps', type: 'timeline', label: '从容上桌的时间表', checkable: false, appearance: { surface: 'outline' }, items: [
      { id: 'shop', time: '前一天', label: '确认与采购', description: '确认人数、忌口与过敏食材，采购食材与饮品。' },
      { id: 'prep', time: '下午', label: '备料与布置', description: '处理鸡肉并冷藏腌制，洗切配菜，备好餐具。' },
      { id: 'cook', time: '开席前', label: '烹饪与摆盘', description: '按食谱安排烘烤，确认鸡肉熟透；临上桌再拌沙拉。' },
      { id: 'serve', time: '18:00', label: '一起开席', description: '分享式上桌，饮品放在大家可以自取的位置。' },
    ] },
    { id: 'tips', type: 'callout', label: '让主人也能好好吃饭', value: '先安排主菜和配菜的烤箱顺序，避免临上桌时争用。生熟食材分开处理，易腐食材及时冷藏。' },
    { id: 'follow', type: 'button', variant: 'primary', action: 'continue', label: '继续细化食谱与预算 →', value: '请按当前人数和食量细化食谱与采购预算。' },
  ],
};
export const bill: UIDocument = {
  version: 1, title: '轻松分账', state: { total: 268, people: 4, tip: 0 }, body: [
    { id: 'fields', type: 'row', children: [
      { id: 'total', type: 'number', label: '账单总额（元）', bind: 'total', min: 0, max: 100000, step: .01 },
      { id: 'people', type: 'number', label: '人数', bind: 'people', min: 1, max: 100, step: 1 },
    ] },
    { id: 'tip', type: 'slider', label: '附加费用比例（%）', bind: 'tip', min: 0, max: 30 },
    { id: 'each', type: 'metric', label: '每人（元，保留两位小数）', value: op('fixed', op('div', op('round', op('mul', state('total'), op('add', 100, state('tip')))), op('mul', state('people'), 100)), 2) },
    { id: 'note', type: 'text', value: '示例按均摊计算；实际支付时请核对四舍五入产生的尾差。' },
  ],
};
const future = (years: number): Expr => op('round', op('mul', state('principal'), op('pow', op('add', 1, op('div', state('rate'), 100)), years)));
export const savings: UIDocument = {
  version: 1, title: '看看储蓄如何增长', state: { principal: 10000, rate: 3 }, body: [
    { id: 'intro', type: 'text', value: '按固定年复利演示增长过程，不包含税费、通胀或收益波动。假设值不代表收益承诺。' },
    { id: 'inputs', type: 'row', children: [{ id: 'principal', type: 'number', label: '起始金额（元）', bind: 'principal', min: 0, max: 10000000, step: 100 }, { id: 'rate', type: 'slider', label: '假设年增长率（%）', bind: 'rate', min: 0, max: 10, step: .1 }] },
    { id: 'growth', type: 'chart', variant: 'line', label: '未来十年的示例金额', columns: ['年份', '金额'], rows: Array.from({ length: 11 }, (_, i) => [`第 ${i} 年`, future(i)]) },
    { id: 'result', type: 'metric', label: '第十年示例金额（元）', value: future(10) },
  ],
};
export const simulation: UIDocument = {
  version: 1, title: '观察摆动', state: {}, body: [{ id: 'pendulum', type: 'app', label: '摆动模拟', code: `
let time=0, speed=typeof ui.state.speed==='number'?ui.state.speed:1;
function draw(){
 const x=200+110*Math.sin(time*speed), y=65+Math.sqrt(180*180-(x-200)*(x-200));
 ui.render({version:1,title:'摆动模拟',state:{speed,part:'all'},body:[
 {id:'speed',type:'slider',label:'播放速度',bind:'speed',min:.2,max:3,step:.1},
 {id:'scene',type:'diagram',label:'理想化运动示意',bind:'part',width:400,height:300,parts:[],shapes:[{type:'line',x:200,y:65,x2:x,y2:y},{type:'circle',x,y,r:18},{type:'circle',x:200,y:65,r:4}]},
 {id:'note',type:'text',value:'这是运动可视化示例，不是精确的物理求解器。'}]});
}
ui.onEvent(e=>{if(e.key==='speed'){speed=e.value;ui.save({speed});draw();}});
ui.onTick(t=>{time=t;draw();});draw();` }],
};
export const game: UIDocument = {
  version: 1, title: '一起下井字棋', state: {}, body: [{ id: 'game', type: 'app', code: `
let board=typeof ui.state.board==='string'&&/^[XO_]{9}$/.test(ui.state.board)?ui.state.board.split(''):Array(9).fill('_');
let turn=ui.state.turn==='O'?'O':'X';
function winner(){for(const line of [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]])if(board[line[0]]!=='_'&&line.every(i=>board[i]===board[line[0]]))return board[line[0]];return '';}
function draw(){const won=winner();ui.render({version:1,title:'井字棋 · 双人',state:{board:board.join(''),turn},body:[{id:'status',type:'text',value:won?won+' 获胜':board.includes('_')?'轮到 '+turn:'平局'},...[0,1,2].map(r=>({id:'row'+r,type:'row',children:[0,1,2].map(c=>({id:'cell'+(r*3+c),type:'button',action:'event',label:board[r*3+c]==='_'?'第 '+(r*3+c+1)+' 格':board[r*3+c]}))})),{id:'restart',type:'button',action:'event',label:'重新开始'}]});}
ui.onEvent(e=>{if(e.key==='restart'){board=Array(9).fill('_');turn='X';}else{const i=Number(e.key.replace('cell',''));if(!Number.isInteger(i)||i<0||i>8||board[i]!=='_'||winner())return;board[i]=turn;turn=turn==='X'?'O':'X';}ui.save({board:board.join(''),turn});draw();});draw();
` }],
};
export const templates = { bicycle, meal, wardrobe, roadtrip, retirement, itemizedBill, clt, gdp, photography, monty, arcade, bill, savings, simulation, game };
export function toUIStream(doc: UIDocument): string {
  return [JSON.stringify({ op: 'begin', version: 2, title: doc.title }), ...Object.entries(doc.state).map(([key, initial]) => JSON.stringify({ op: 'state', key, initial })), ...doc.body.map(node => JSON.stringify({ op: 'node', node })), JSON.stringify({ op: 'commit' })].join('\n');
}

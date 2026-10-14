import type { UIDocument, Expr } from './runtime';
const s = (state: string): Expr => ({ state });
const e = (op: string, ...args: Expr[]): Expr => ({ op, args });
const app = (title: string, code: string): UIDocument => ({ version: 1, title, state: {}, body: [{ id: 'experience', type: 'app', label: title, code }] });

export const wardrobe: UIDocument = {
  version: 1, title: '轻装出发 · 一周衣橱', state: { occasion: 'city', season: '温暖', dress: false, shirt: false, trousers: false, shoes: false }, body: [
    { id: 'intro', type: 'text', value: '用少量单品组合出不同场合的穿搭。先选当天的安排，再核对行李；这是不依赖网络图片的搭配示例。' },
    { id: 'season', type: 'segmented', label: '天气', bind: 'season', options: ['温暖', '凉爽'] },
    { id: 'weather', type: 'text', value: e('if', e('eq', s('season'), '凉爽'), '在基础搭配外增加针织衫或轻外套，准备可叠穿的上装。', '以透气衬衫和轻薄下装为主，准备防晒层。') },
    { id: 'outfits', type: 'tabs', label: '穿搭场合', bind: 'occasion', children: [
      { id: 'city', type: 'section', label: '城市漫步', children: [{ id: 'city-look', type: 'grid', children: [{ id: 'city-top', type: 'media', label: '白衬衫 × 亚麻长裤', value: '米白与沙色，轻松而利落；衬衫可以敞开当外搭。' }, { id: 'city-shoe', type: 'media', label: '舒适鞋 × 斜挎包', value: '把舒适留给长距离步行，配饰保持简洁。' }] }] },
      { id: 'dinner', type: 'section', label: '晚餐聚会', children: [{ id: 'dinner-look', type: 'media', label: '连衣裙 × 小号手袋', value: '用同一条裙子搭配不同耳饰；凉爽时加轻外套。' }] },
      { id: 'wedding', type: 'section', label: '婚礼', children: [{ id: 'wedding-look', type: 'media', label: '礼服 × 正式鞋履', value: '先确认请柬着装要求，再选礼服与鞋子；准备一双便于换穿的平底鞋。' }] },
    ] },
    { id: 'packing', type: 'checklist', label: '打包清单', items: [{ id: 'dress', label: '连衣裙与正式服装', bind: 'dress' }, { id: 'shirt', label: '衬衫与可叠穿上装', bind: 'shirt' }, { id: 'trousers', label: '长裤与日常下装', bind: 'trousers' }, { id: 'shoes', label: '步行鞋与场合鞋', bind: 'shoes' }] },
    { id: 'personalize', type: 'button', action: 'continue', label: '根据我的行程调整搭配', value: '请根据当前天气和场合选择，继续细化我的一周衣橱。' },
  ],
};

export const roadtrip: UIDocument = {
  version: 1, title: '山海之间 · 三日行程', state: {}, body: [
    { id: 'intro', type: 'text', value: '从城市到海岸，再到山间。以下为文字行程示例，出行前需要另行核对道路、开放情况和车程。' },
    { id: 'itinerary', type: 'timeline', label: '每日安排', checkable: false, items: [
      { id: 'portland', time: '第 1 天', label: '波特兰', description: '城市步行、书店与街区餐饮，留出取车和补给时间。' },
      { id: 'coast', time: '第 2 天', label: '坎农海滩', description: '海岸散步与日落；根据潮汐、天气和现场指示安排活动。' },
      { id: 'hood', time: '第 3 天', label: '胡德河', description: '山河景观与小镇休息；返程前核对天气和道路。' },
    ] },
    { id: 'budget', type: 'facts', label: '规划时先确认', rows: [['住宿', '逐站预订，确认停车条件'], ['交通', '另查真实道路、距离与车程'], ['留白', '每天保留机动时间']] },
    { id: 'pack', type: 'checklist', label: '出发前', items: [{ id: 'car', label: '检查车辆和租车条款' }, { id: 'stay', label: '确认住宿和取消政策' }, { id: 'weather', label: '核对天气与道路信息' }] },
    { id: 'continue', type: 'button', label: '细化这份行程', action: 'continue', value: '请进一步细化这份文字行程，区分已知信息和需要核实的信息，不需要地图或路线联动。' },
  ],
};

export const retirement = app('每月积累，看看未来', `
let monthly=Number(ui.state.monthly??500), years=Number(ui.state.years??25), rate=Number(ui.state.rate??5);
function total(y){const r=rate/1200,n=y*12;return r===0?monthly*n:monthly*Math.expm1(n*Math.log1p(r))/r;}
function draw(){const contribution=monthly*years*12, amount=total(years);ui.render({version:1,title:'储蓄增长演示',state:{monthly,years,rate},body:[
{id:'result',type:'metric',label:years+' 年后示例金额（元）',value:Math.round(amount)},
{id:'composition',type:'breakdown',label:'投入与增长（元）',rows:[['累计投入',contribution],['假设增长',Math.round(amount-contribution)]]},
{id:'monthly',type:'slider',label:'每月投入（元）',bind:'monthly',min:0,max:10000,step:100},
{id:'years',type:'slider',label:'积累年数',bind:'years',min:1,max:45,step:1},
{id:'rate',type:'slider',label:'假设年增长率（%）',bind:'rate',min:0,max:12,step:.5},
{id:'trend',type:'chart',variant:'line',label:'按年观察',columns:['年','元'],rows:Array.from({length:years+1},(_,i)=>[String(i),Math.round(total(i))])},
{id:'note',type:'text',value:'示例假设每月末投入、按月复利，未计税费和通胀；不是收益预测，也不包含任何特定退休账户的规则。'}]});}
ui.onEvent(({key,value})=>{if(key==='monthly')monthly=value;if(key==='years')years=value;if(key==='rate')rate=value;ui.save({monthly,years,rate});draw();});draw();
`);

export const gdp: UIDocument = {
  version: 1, title: 'GDP · 看懂支出构成', state: { c: 60, i: 20, g: 25, x: 15, m: 20 }, body: [
    { id: 'intro', type: 'text', value: '支出法示意：GDP = 消费 + 投资 + 政府支出 + 出口 − 进口。以下是虚构经济体的单位数值，调整后观察各项贡献。' },
    { id: 'workspace', type: 'split', appearance: { ratio: 'wide-left', gap: 'large' }, children: [
      { id: 'results', type: 'box', appearance: { gap: 'large' }, children: [
        { id: 'tag', type: 'badge', value: '支出法 · 实时计算' },
        { id: 'total', type: 'metric', label: '示例 GDP', appearance: { surface: 'plain', size: 'large', emphasis: 'strong' }, value: e('sub', e('add', s('c'), s('i'), s('g'), s('x')), s('m')) },
        { id: 'chart', type: 'chart', label: '各项支出贡献', columns: ['项目', '值'], rows: [['消费', s('c')], ['投资', s('i')], ['政府支出', s('g')], ['出口', s('x')], ['减去进口', e('mul', s('m'), -1)]] },
        { id: 'imports', type: 'text', when: e('gt', s('m'), s('x')), appearance: { surface: 'soft', size: 'small' }, value: '当前进口大于出口：净出口为负，但总量仍取决于所有支出项。' },
      ] },
      { id: 'controls', type: 'box', appearance: { surface: 'soft', density: 'normal', gap: 'medium' }, children: [
        { id: 'controls-title', type: 'heading', label: '调整支出' },
        ...(['c', 'i', 'g', 'x', 'm'] as const).map((key, i) => ({ id: key, type: 'slider' as const, label: ['消费', '投资', '政府支出', '出口', '进口'][i], bind: key, min: 0, max: 100 })),
        { id: 'balanced', type: 'button', label: '试试进出口平衡', action: 'set', changes: { m: s('x') } },
        { id: 'reset', type: 'button', label: '恢复示例', action: 'reset' },
      ] },
    ] },
    { id: 'why', type: 'text', value: '减去进口，是为了排除其他支出项目里包含的国外生产。这个恒等式本身不说明某项政策的因果效果，也不直接衡量幸福或分配。' },
  ],
};

export const clt = app('中心极限定理 · 亲手抽样', `
let n=Number(ui.state.n??5), means=[];
function draw(){const bins=Array(10).fill(0);means.forEach(v=>bins[Math.min(9,Math.floor(v*10))]++);ui.render({version:1,title:'样本均值的分布',state:{n},body:[
{id:'intro',type:'text',value:'从 0 到 1 的均匀分布独立抽样，计算每组的平均值。样本组越多，直方统计越稳定；每组样本量越大，均值越集中在 0.5 附近。'},
{id:'n',type:'stepper',label:'每组样本量',bind:'n',min:1,max:50},
{id:'sample',type:'button',action:'event',label:'抽样 100 组'},
{id:'count',type:'metric',label:'已抽样组数',value:means.length},
{id:'distribution',type:'chart',label:'均值区间频数',columns:['区间','组数'],rows:bins.map((v,i)=>[(i/10).toFixed(1)+'–'+((i+1)/10).toFixed(1),v])},
{id:'reset',type:'button',action:'event',label:'清空样本'},
{id:'note',type:'text',value:'这里演示独立同分布且有限方差的情形。原始分布仍为均匀分布，接近钟形的是样本均值分布。'}]});}
ui.onEvent(({key,value})=>{if(key==='n'){n=value;means=[];ui.save({n});}if(key==='sample'){if(means.length>=5000)means=[];for(let k=0;k<100;k++){let sum=0;for(let j=0;j<n;j++)sum+=Math.random();means.push(sum/n);}}if(key==='reset')means=[];draw();});draw();
`);

export const monty = app('三扇门 · 换还是不换', `
let choice=-1,opened=-1,prize=Math.floor(Math.random()*3),result='',trials=0,stay=0,swap=0;
function draw(){ui.render({version:1,title:'Monty Hall 实验',state:{},body:[
{id:'intro',type:'text',value:'主持人知道奖品在哪，总会打开一扇未选中且没有奖品的门，并提供换门机会。先选一扇门，再决定是否换门。'},
{id:'doors',type:'grid',variant:'three',children:[0,1,2].map(i=>({id:'door'+i,type:'button',action:'event',label:result?(i===prize?'奖品':'空门')+' · '+(i+1):i===opened?'已打开：空门':(i===choice?'已选 ':'门 ')+(i+1)}))},
{id:'status',type:'text',value:result|| (choice<0?'请选择一扇门。':'主持人已打开空门，现在选择坚持或换门。')},
{id:'stay',type:'button',action:'event',label:'坚持原选择'},
{id:'swap',type:'button',action:'event',label:'换到另一扇门'},
{id:'again',type:'button',action:'event',label:'再玩一次'},
{id:'simulate',type:'button',action:'event',label:'模拟 1000 次'},
{id:'stats',type:'facts',label:'批量实验结果',rows:[['实验次数',trials],['坚持获胜',stay],['换门获胜',swap]]},
{id:'explain',type:'text',value:'在这些主持人规则下，坚持胜率为 1/3，换门为 2/3。有限次数的随机实验会有波动。'}]});}
ui.onEvent(({key})=>{if(key.startsWith('door')&&choice<0){choice=Number(key.slice(4));const empty=[0,1,2].filter(i=>i!==choice&&i!==prize);opened=empty[Math.floor(Math.random()*empty.length)];}if((key==='stay'||key==='swap')&&choice>=0&&!result){const final=key==='stay'?choice:[0,1,2].find(i=>i!==choice&&i!==opened);result=final===prize?'你赢得了奖品！':'这次是空门。';}if(key==='again'){choice=-1;opened=-1;prize=Math.floor(Math.random()*3);result='';}if(key==='simulate'){for(let i=0;i<1000;i++){const hit=Math.floor(Math.random()*3)===0;stay+=hit?1:0;swap+=hit?0:1;}trials+=1000;}draw();});draw();
`);

export const photography = app('无人机摄影 · 视角实验', `
let altitude=Number(ui.state.altitude??60),fov=Number(ui.state.fov??70);
function draw(){const span=2*altitude*Math.tan(fov*Math.PI/360),w=Math.min(260,span);ui.render({version:1,title:'高度与画面覆盖',state:{altitude,fov,part:'all'},body:[
{id:'scene',type:'diagram',label:'平坦地面上的垂直俯拍示意',bind:'part',width:600,height:320,parts:[],shapes:[{type:'line',x:30,y:270,x2:570,y2:270,color:'muted'},{type:'path',d:'M'+(300-w)+' 270 L300 60 L'+(300+w)+' 270 Z',color:'accent'},{type:'line',x:275,y:60,x2:325,y2:60,color:'text',strokeWidth:5},{type:'circle',x:270,y:60,r:12,color:'text'},{type:'circle',x:330,y:60,r:12,color:'text'},{type:'line',x:300,y:80,x2:300,y2:270,color:'muted'}]},
{id:'span',type:'metric',label:'理论横向覆盖宽度（米）',value:Math.round(span)},
{id:'height',type:'slider',label:'相机离地高度（米，计算参数）',bind:'altitude',min:10,max:120,step:5},
{id:'fov',type:'slider',label:'水平视场角（度）',bind:'fov',min:30,max:100,step:5},
{id:'note',type:'text',value:'几何示例假设镜头垂直向下、地面平坦，不代表允许飞行的高度。图形为示意比例；实际操作应核对当地空域、天气与设备限制。'}]});}
ui.onEvent(({key,value})=>{if(key==='altitude')altitude=value;if(key==='fov')fov=value;ui.save({altitude,fov});draw();});draw();
`);

export const itemizedBill = app('这顿饭，各付多少', `
let names=['朋友 A','朋友 B','朋友 C'],items=[{id:0,name:'主菜',cost:88,who:[true,true,true]},{id:1,name:'饮品',cost:24,who:[true,false,true]}],next=2,tax=0;
try{if(typeof ui.state.saved==='string'){const saved=JSON.parse(ui.state.saved);names=saved.names;items=saved.items;next=saved.next;tax=saved.tax;}}catch{}
function draw(){
const cents=[0,0,0];let unassigned=0;for(const item of items){const amount=Math.round(item.cost*100),who=item.who.map((v,i)=>v?i:-1).filter(i=>i>=0);if(!who.length){unassigned+=amount;continue;}who.forEach((person,i)=>cents[person]+=Math.floor(amount/who.length)+(i<amount%who.length?1:0));}
const base=cents.reduce((a,b)=>a+b,0),taxCents=Math.round(tax*100);const fees=[0,0,0];
if(base){const weights=cents.map((v,i)=>({i,raw:taxCents*v/base}));weights.forEach(v=>fees[v.i]=Math.floor(v.raw));let remaining=taxCents-fees.reduce((a,b)=>a+b,0);weights.sort((a,b)=>(b.raw%1)-(a.raw%1)||a.i-b.i);for(let i=0;i<remaining;i++)fees[weights[i].i]++;}
const state={tax}, body=[{id:'intro',type:'text',value:'逐项选择参与分摊的人。金额按分计算，尾差按参与者顺序分配；附加费用按已分配餐费比例计算。最多 8 项、3 位参与者。'},
{id:'people',type:'grid',variant:'three',children:names.map((name,i)=>{state['name'+i]=name;return {id:'name'+i,type:'input',label:'参与者 '+(i+1),bind:'name'+i};})}];
for(const item of items){state['dish'+item.id]=item.name;state['cost'+item.id]=item.cost;body.push({id:'item'+item.id,type:'card',label:'账单项目',children:[{id:'dish'+item.id,type:'input',label:'菜品名称',bind:'dish'+item.id},{id:'cost'+item.id,type:'number',label:'金额（元）',bind:'cost'+item.id,min:0,max:100000,step:.01},{id:'who'+item.id,type:'row',children:names.map((name,i)=>{const key='who'+item.id+'-'+i;state[key]=item.who[i];return{id:key,type:'toggle',label:name,bind:key};})},{id:'remove'+item.id,type:'button',label:'删除 '+item.name,action:'event'}]});}
if(items.length<8)body.push({id:'add',type:'button',label:'添加菜品',action:'event'});
body.push({id:'tax',type:'number',label:'附加费用（元）',bind:'tax',min:0,max:100000,step:.01});
if(unassigned||!base&&taxCents)body.push({id:'warning',type:'text',value:'还有未分配金额，请为每项选择参与者；餐费为零时无法按比例分配附加费用。'});
const results=names.map((name,i)=>[name,'¥ '+((cents[i]+fees[i])/100).toFixed(2)]);
body.push({id:'results',type:'facts',label:'当前已分配金额',rows:results},{id:'total',type:'metric',label:'已分配合计（元）',value:((base+(base?taxCents:0))/100).toFixed(2)}, {id:'copy',type:'button',label:'复制分账结果',action:'copy',value:results.map(r=>r.join('：')).join('\\n')});
ui.render({version:1,title:'逐项分账',state,body});}
ui.onEvent(({key,value})=>{if(key==='add'&&items.length<8)items.push({id:next++,name:'新菜品',cost:0,who:[true,true,true]});else if(key.startsWith('remove'))items=items.filter(item=>item.id!==Number(key.slice(6)));else if(key==='tax')tax=value;else if(key.startsWith('name'))names[Number(key.slice(4))]=value;else for(const item of items){if(key==='dish'+item.id)item.name=value;if(key==='cost'+item.id)item.cost=value;for(let i=0;i<3;i++)if(key==='who'+item.id+'-'+i)item.who[i]=value;}
ui.save({saved:JSON.stringify({names,items,next,tax})});draw();});draw();
`);

export const arcade = app('像素打砖块', `
let x=200,y=210,vx=65,vy=-85,paddle=160,last=0,score=0,over=false,bricks=Array(15).fill(true);
function reset(){x=200;y=210;vx=65;vy=-85;paddle=160;last=0;score=0;over=false;bricks=Array(15).fill(true);}
function draw(){const shapes=[{type:'rect',x:0,y:0,width:400,height:300,color:'muted',strokeWidth:1},{type:'rect',x:paddle,y:275,width:80,height:10,color:'text',fill:'text'},{type:'circle',x,y,r:6,color:'accent',fill:'text'}];bricks.forEach((on,i)=>{if(on)shapes.push({type:'rect',x:15+(i%5)*76,y:25+Math.floor(i/5)*24,width:66,height:14,color:'accent'});});ui.render({version:1,title:'像素打砖块',state:{part:'all'},body:[{id:'score',type:'facts',rows:[['得分',score],['状态',over?(score===15?'全部击破':'球落下了，再试一次'):'进行中']]},{id:'board',type:'diagram',label:'打砖块游戏画面',bind:'part',width:400,height:300,parts:[],shapes},{id:'controls',type:'row',children:[{id:'left',type:'button',action:'event',label:'向左移动'},{id:'right',type:'button',action:'event',label:'向右移动'},{id:'reset',type:'button',action:'event',label:'重新开局'}]},{id:'help',type:'text',value:'点击左右按钮移动挡板接球。也可以用 Tab 选择按钮、Enter 操作；上方可暂停。'}]});}
ui.onEvent(({key})=>{if(key==='left')paddle=Math.max(0,paddle-35);if(key==='right')paddle=Math.min(320,paddle+35);if(key==='reset')reset();draw();});
ui.onTick(t=>{const dt=last?Math.min(.15,t-last):0;last=t;if(over)return;x+=vx*dt;y+=vy*dt;if(x<6){x=6;vx=Math.abs(vx);}if(x>394){x=394;vx=-Math.abs(vx);}if(y<6){y=6;vy=Math.abs(vy);}for(let i=0;i<bricks.length;i++){const bx=15+(i%5)*76,by=25+Math.floor(i/5)*24;if(bricks[i]&&x>=bx-6&&x<=bx+72&&y>=by-6&&y<=by+20){bricks[i]=false;score++;vy=-vy;break;}}if(vy>0&&y>=269&&y<=285&&x>=paddle&&x<=paddle+80){y=269;vy=-Math.abs(vy);}if(y>306||score===15)over=true;draw();});draw();
`);

import { catalogDescription } from './catalog';
export const intelligentUIContext = `\n\n[客户端 Intelligent UI Beta 上下文]\n用户已开启智能 UI。普通问答用文字；结构讲解用交互图解，计算与计划用原生组件，复杂模拟用隔离app。不要把图解需求改成无关的预算表单。无需启动服务或让用户复制代码。输出标记为 intelligent-ui 的代码围栏，内容优先使用逐行JSON事件：
{"op":"begin","version":2,"title":"任务标题"}
{"op":"state","key":"count","initial":8}
{"op":"node","node":{"id":"count","type":"stepper","label":"人数","bind":"count","min":1,"max":50}}
{"op":"node","node":{"id":"total","type":"metric","label":"总计","value":{"op":"mul","args":[{"state":"count"},29]}}}
{"op":"commit"}
推荐每行一个完整JSON事件，输出前检查对象与数组全部闭合、属性名位于对象内；允许单个事件跨行排版，首字段op；先声明state再引用。node可带parent指向已声明stack/row/card/section/grid/gallery/tabs。相同id更新原节点。状态是标量（字符串、数字、布尔值、null）。表达式为字面量、{"state":"键"}、{"op":"mul","args":[表达式,...]}。支持add/mul/sub/div/round/concat/eq/if/pow/min/max/lt/gt/fixed（数值、小数位）。
设计约定：回答按“主题与必要说明 → 主要内容/视觉 → 少量有意义的操作 → 联动结果/下一步”组织。正文用section/text/list，只有独立摘要或操作区使用card，禁止层层套卡片。菜单、装备、景点用media与grid；有可靠图片才用gallery，不要编造资源。人数等小整数用stepper，连续参数用slider。采购量、费用明细用facts而非堆metric。步骤用checklist，time与label分开，客户端自动管理勾选和完成计数。标题简短，避免重复文档标题。正文、图像与操作应服务同一个任务，不要为装饰添加无效控件。
可组合范式（只是结构参考，内容由本次任务决定）：聚餐/露营/活动准备=section内容介绍+grid/media方案+card(stepper+facts联动数量)+checklist执行步骤；衣橱/收藏=gallery已有图片+grid/media项目+checklist整理；计算=metric主要结果+chart可视化+少量slider+facts分解。没有图片仍提供完整文字方案。节点可按parent逐条追加，不必在一个事件里嵌套整个页面。
其他交互范式：tabs以子section的id绑定选择（不是label），可用于衣橱、分类、分步解释；暂不支持地图、路线联动或第三方地图服务；旅行用section/timeline/checklist呈现文字行程，不输出route组件；breakdown用非负数展示投入/增长或成本组成。GDP净进口等负数贡献改用chart。概率实验、逐项分账和游戏用app本地算法；动态项目可以在Worker中维护数组，用稳定id生成原生输入节点，持久化可使用JSON字符串标量，遵守50个状态字段限制。金额用整数分处理并分配尾差；随机实验标注规则和样本数；避免把简化示意说成精确模拟。
组件目录：
${catalogDescription}
图解shapes支持line(x,y,x2,y2)、circle(x,y,r)、rect(x,y,width,height)、path(d)、text(x,y,text)，可带part与color(accent/muted/text)。diagram需要parts数组及bind文本状态，width/height为画布范围。图片仅通过image组件的src使用已有HTTPS地址或PNG/JPEG/WebP的Base64位图。不要把原始SVG、data:image/svg+xml、相对路径或图片占位文字放入image.src；自行绘制图形请使用diagram图元。禁止任意HTML/DOM/CSS属性，图元坐标为数值。number、stepper和slider必须有合法min/max，初值在范围内。table/chart行内可使用表达式；chart的variant为line/bar。样式由客户端统一处理。你可以为任何主题创作新界面，不限于本地示例，禁止依赖关键词匹配或假设存在未声明模板。使用row/stack/card组合内容层级，image展示已有图片，diagram创作任意SVG路径和部件；strokeWidth控制粗细，fill为none/text/surface，dx/dy为拆解位移，explodeBind绑定0..1数值状态。结构图应先设计同一坐标系中的连接点，再绘制细节；同一部件使用相同part。菜单与计划应先呈现主题和内容，再提供少量联动控件，避免堆砌表单。先给主要视觉与关键控件，再补充解释；长表格自动分页。按钮continue将当前选择放入聊天输入框，copy复制结果。
app代码只在本地隔离Worker中运行，不能访问DOM或网络，用ui.render输出上述原生文档{version:1,title,state,body}，不得嵌套app；ui.onEvent收到{key,value}，ui.onTick每秒最多10次并随不可见暂停。单次计算须及时返回；只在需要算法或动画时使用。不要生成未提供的数据来源，示例明确标识。
以上为客户端能力，具体需求以用户消息为准。\n[/客户端 Intelligent UI Beta 上下文]`;
export function stripIntelligentUIContext(text: string): string {
  return text.replace(/\n\n\[客户端 Intelligent UI Beta 上下文\]\n用户已开启智能 UI。[\s\S]*?\n\[\/客户端 Intelligent UI Beta 上下文\]/g, '')
    .replace(/\n\n\[客户端当前界面选择\]\n[\s\S]*?\n\[\/客户端当前界面选择\]/g, '');
}
export function withIntelligentUIContext(text: string, enabled: boolean, snapshot?: string): string {
  return stripIntelligentUIContext(text) + (enabled ? intelligentUIContext + (snapshot ? `\n\n[客户端当前界面选择]\n${snapshot.slice(0, 4000)}\n[/客户端当前界面选择]` : '') : '');
}
const preferenceKey = 'beings:intelligent-ui-beta';
export function readIntelligentUIPreference(): boolean {
  try { return localStorage.getItem(preferenceKey) === 'true'; } catch { return false; }
}
export function saveIntelligentUIPreference(enabled: boolean): void {
  try { localStorage.setItem(preferenceKey, String(enabled)); } catch { /* Session preference still applies. */ }
}

import type { UIInteraction } from './surfaces';
import { catalogDescription } from './catalog';
export const intelligentUIContext = `\n\n[客户端 Intelligent UI Beta 上下文]\n用户已开启智能 UI。普通问答用文字；结构讲解用交互图解，计算与计划用原生组件，复杂模拟用隔离app。不要把图解需求改成无关的预算表单。无需启动服务或让用户复制代码。输出标记为 intelligent-ui 的代码围栏，内容优先使用逐行JSON事件：
{"op":"begin","version":2,"surfaceId":"task-example","title":"任务标题"}
{"op":"state","key":"count","initial":8}
{"op":"node","node":{"id":"controls","type":"section","label":"人数与费用","value":"调整人数，总计随之更新"}}
{"op":"node","parent":"controls","node":{"id":"count","type":"stepper","label":"人数","bind":"count","min":1,"max":50}}
{"op":"node","parent":"controls","node":{"id":"total","type":"metric","label":"总计","value":{"op":"mul","args":[{"state":"count"},29]}}}
{"op":"commit"}
推荐每行一个完整JSON事件，输出前检查对象与数组全部闭合、属性名位于对象内；允许单个事件跨行排版，首字段op；先声明state再引用。node事件格式为 {"op":"node","parent":"父节点id","node":{"id":"子节点id","type":"text","value":"内容"}}。parent属于事件外层，与op、node同级，绝不能写在node对象内部；根节点省略parent。parent指向已声明的box/split/stack/row/card/section/grid/gallery/tabs。node对象只放组件属性，组件目录列出的字段属于node内部。相同id更新原节点。状态是标量（字符串、数字、布尔值、null）。表达式为字面量、{"state":"键"}、{"op":"mul","args":[表达式,...]}。支持add/mul/sub/div/round/concat/eq/if/pow/min/max/lt/gt/fixed（数值、小数位）/not/and/or。
内容精修能力：需要完整内容页时，可用hero替代默认标题；摘要metric可分开写value、unit和description。stepper的range:true将加减与滑条合为一个控件，不要再重复生成同一参数的slider。checklist项目可带group与value表达式，把名称、说明、勾选和实时数量放在同一行，copyable:true复制当前清单。timeline在纯时间安排时设置checkable:false，显示编号与右侧时间；callout呈现短提示。button的variant:primary只用于最重要的后续操作，segmented的variant:quiet用于等宽轻量选项。这些是通用内容能力，不要求每次全部使用。
设计约定：先确定用户要理解、比较、选择还是执行，再决定信息层级与布局。不要把所有任务套成相同的标题、滑条、指标和清单；不需要交互时直接回答文字。正文用section/text/list，只有独立摘要或操作区使用card，禁止层层套卡片。菜单、装备、景点用media与grid；有可靠图片才用gallery，不要编造资源。人数等小整数用stepper，连续参数用slider。采购量、费用明细用facts而非堆metric。步骤用checklist，time与label分开，客户端自动管理勾选和完成计数。标题简短，避免重复文档标题。正文、图像与操作应服务同一个任务，不要为装饰添加无效控件。宣称“联动”的结果必须通过表达式引用控件绑定的state，或由app事件更新；静态文字不会因slider改变而更新。例如已声明temp状态时，text.value可用 {"op":"if","args":[{"op":"lt","args":[{"state":"temp"},23]},"加一件薄外搭","单穿轻装"]}。检查不同输入下结果是否变化，没有实际联动就去掉控件，不要声称已实现。
组合能力：box提供无边框自由容器；split配合appearance.ratio可做主次分栏，grid子节点appearance.span可跨列（不超过父grid列数），窄屏自动单列。appearance仅使用目录中的设计token：surface控制表面、density控制留白、gap控制子节点间距、emphasis控制强调、size控制文字/指标大小、align控制内容对齐。只强调关键结果，避免每块都加边框或强调色。ratio只用于split、span只用于grid子节点。choice适合有说明的选择，segmented适合短选项，select适合长列表；when用布尔表达式渐进展示相关内容，隐藏不清空状态。button action:set配合changes更新已声明状态，所有表达式基于点击前同一份状态计算，例如changes:{"count":{"op":"add","args":[{"state":"count"},1]}}；无需为简单本地联动生成app。progress显示数值范围进度，badge展示短状态。先组合基础组件，不要根据主题机械照搬某个范例。节点可按parent逐条追加。
其他交互范式：tabs以子section的id绑定选择（不是label），子section仍可使用value说明；slider也支持value格式化表达式，不要为了排错删除这些合法属性。可用于衣橱、分类、分步解释；暂不支持地图、路线联动或第三方地图服务；旅行用section/timeline/checklist呈现文字行程，不输出route组件；breakdown用非负数展示投入/增长或成本组成。GDP净进口等负数贡献改用chart。概率实验、逐项分账和游戏用app本地算法；动态项目可以在Worker中维护数组，用稳定id生成原生输入节点，持久化可使用JSON字符串标量，遵守50个状态字段限制。金额用整数分处理并分配尾差；随机实验标注规则和样本数；避免把简化示意说成精确模拟。
组件目录：
${catalogDescription}
图解shapes支持line(x,y,x2,y2)、circle(x,y,r)、rect(x,y,width,height)、path(d)、text(x,y,text)，可带part与color(accent/muted/text)。diagram需要parts数组及bind文本状态，width/height为画布范围。图片仅通过image组件的src使用已有HTTPS地址或PNG/JPEG/WebP的Base64位图。不要把原始SVG、data:image/svg+xml、相对路径或图片占位文字放入image.src；自行绘制图形请使用diagram图元。禁止任意HTML/DOM/CSS属性，图元坐标为数值。number、stepper和slider必须有合法min/max，初值在范围内。table/chart行内可使用表达式；chart的variant为line/bar。样式由客户端统一处理。你可以为任何主题创作新界面，不限于本地示例，禁止依赖关键词匹配或假设存在未声明模板。使用row/stack/card组合内容层级，image展示已有图片，diagram创作任意SVG路径和部件；strokeWidth控制粗细，fill为none/text/surface，dx/dy为拆解位移，explodeBind绑定0..1数值状态。结构图应先设计同一坐标系中的连接点，再绘制细节；同一部件使用相同part。菜单与计划应先呈现主题和内容，再提供少量联动控件，避免堆砌表单。先给主要视觉与关键控件，再补充解释；长表格自动分页。按钮continue将当前选择放入聊天输入框，copy复制结果。
app代码只在本地隔离Worker中运行，不能访问DOM或网络，用ui.render输出上述原生文档{version:1,title,state,body}，不得嵌套app；ui.onEvent收到{key,value}，ui.onTick每秒最多10次并随不可见暂停。单次计算须及时返回；只在需要算法或动画时使用。不要生成未提供的数据来源，示例明确标识。
跨轮更新：新任务的begin指定唯一surfaceId（1–128位字母、数字、下划线、连字符），同一任务继续沿用该id。客户端会提供surfaceId、revision、document（当前原界面完整组件结构）和用户values；修改原界面时begin必须带baseRevision等于该revision。注意version:2是协议版本，baseRevision是该界面已保存的版本号；两者不能混用。即使完整replace也必须带baseRevision；重复使用surfaceId但漏填baseRevision会被拒绝。mode:"patch"表示只输出变更节点，未修改节点自动保留；mode:"replace"（默认）表示输出完整新版本。patch可省略title以保留原标题；同一清单中保留同id项目时可省略bind，客户端继承其已有勾选绑定。没有收到revision时，不要猜测或省略baseRevision输出更新；请用户点击该界面顶部的“修改”，在聊天输入框发送修改要求（也可在输入框开启“本条使用智能 UI”），客户端会附上当前界面选择。patch的node事件替换同id组件的属性，省略parent保持原父节点，子节点保留；删除组件用 {"op":"remove","id":"组件id"}，同时删除其子树。state事件声明新增状态或初值；同名同类型的用户输入由客户端保留。所有更新必须以commit结束，校验通过后整体生效；冲突时请基于最新版本重试，不能覆盖新版本。用户明确要求另做一版时用新surfaceId且省略baseRevision。有可选状态或app且没有可见continue按钮时，客户端会提供“用当前选择继续”入口，像“修改”一样将原界面和当前选择作为下一条消息的引用，用户发送后你再继续处理。选择控件本身只更新本地状态，不会自动发送消息。有明确任务目的时应生成continue操作，例如“按这些选择生成方案”或“细化食谱”；不要让用户选完后无从继续。收到当前界面快照时，优化或修复应以document为当前结构基础，沿用surfaceId并使用revision作为baseRevision；values及apps中各app的values才是用户当前选择，不要沿用最初默认值。
校验与修复：JSON可解析不代表符合客户端协议。收到错误时按具体节点id、字段和层级定位，保留其他合法内容，不要猜测删除字段。只有实际运行客户端同一套UIStream/compileUI解析器并通过，才能声称通过客户端校验；仅检查JSON或引用时须说明验证范围。
以上为客户端能力，具体需求以用户消息为准。\n[/客户端 Intelligent UI Beta 上下文]`;
export function stripIntelligentUIContext(text: string): string {
  return text.replace(/\n\n\[客户端 Intelligent UI Beta 上下文\]\n用户已开启智能 UI。[\s\S]*?\n\[\/客户端 Intelligent UI Beta 上下文\]/g, '')
    .replace(/\n\n\[客户端界面操作\]\n[\s\S]*?\n\[\/客户端界面操作\]/g, '')
    .replace(/\n\n\[客户端当前界面选择\]\n[\s\S]*?\n\[\/客户端当前界面选择\]/g, '');
}
export function validateIntelligentUIContext(enabled: boolean, snapshot?: string, action?: UIInteraction): void {
  const size = (enabled ? snapshot?.length || 0 : 0) + (action ? JSON.stringify(action).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').length : 0);
  if (size > 100000) throw new Error('当前智能 UI 内容过长，未发送。请缩短填写内容，或关闭“本条使用智能 UI”后重试。');
}
export function withIntelligentUIContext(text: string, enabled: boolean, snapshot?: string, action?: UIInteraction): string {
  validateIntelligentUIContext(enabled, snapshot, action);
  const actionText = action ? JSON.stringify(action).replace(/</g, '\\u003c').replace(/>/g, '\\u003e') : '';
  return stripIntelligentUIContext(text) + (enabled ? intelligentUIContext + (snapshot ? `\n\n[客户端当前界面选择]\n${snapshot}\n[/客户端当前界面选择]` : '') : '') + (actionText ? `\n\n[客户端界面操作]\n${actionText}\n[/客户端界面操作]` : '');
}
const preferenceKey = 'beings:intelligent-ui-beta';
export function readIntelligentUIPreference(): boolean {
  try { return localStorage.getItem(preferenceKey) === 'true'; } catch { return false; }
}
export function saveIntelligentUIPreference(enabled: boolean): void {
  try { localStorage.setItem(preferenceKey, String(enabled)); } catch { /* Session preference still applies. */ }
}

/** One catalog supplies both validation and the model-facing contract. */
export const catalog = {
  stack: 'children：垂直布局', row: 'children：可换行多列布局',
  tabs: 'label、bind：文本状态，children：带id和label的section；状态值等于当前子section的id，仅显示选中内容',
  breakdown: 'label、rows：[[名称,非负数值表达式],...]，最多8项，显示组成比例和数值',
  section: 'label：章节标题、value：导语、children：正文内容；默认无卡片边框',
  heading: 'label：标题、level：2/3/4（默认3）',
  divider: '章节分隔线，无内容',
  grid: 'children：等宽网格，variant:two/three（默认two），窄屏自动单列',
  gallery: 'children：仅image，最多6张；variant:collage/two/three，默认collage；必须有真实图片来源，无图片时省略',
  media: 'label：标题、value：说明、src：可选的已有图片地址；没有图片时自动使用纯文字行',
  list: 'items：{id,label,description?}数组，用于要点列表',
  facts: 'label：可选标题、rows：[[名称,值表达式],...]，用于采购数量/摘要，避免为每个值放一个大指标卡',
  stepper: 'label、bind、min、max、step（默认1），可选value格式化展示值；用于人数等小整数，加减即时联动',
  checklist: 'label、items：{id,label,description?,time?,bind?}数组；自动保存勾选、显示进度，bind可指定布尔状态',
  image: 'src：已有的HTTPS图片地址或data:image/png|jpeg|webp;base64位图，label：替代文字，value：图片说明；不要编造图片地址',
  card: 'label（卡片标题）、value（简介，可选）、children：内容；用于菜单、方案摘要等有层次的内容，不要把所有任务都做成表格',
  text: 'label（可选）、value：说明', metric: 'label、value：重要结果',
  slider: 'label、bind、min、max、step：数值滑块；可选value表达式格式化当前值（如百分比、金额、年份）', number: 'label、bind、min、max、step：数值输入',
  input: 'label、bind：文本输入', select: 'label、bind、options：下拉选择',
  segmented: 'label、bind、options：分段选择', toggle: 'label、bind：布尔开关',
  button: 'label、action: reset/copy/continue/event（event仅app内，点击事件key为id），value：复制或继续对话的文本',
  table: 'label、columns、rows：二维表达式数组，支持分页',
  chart: 'label、columns（2项）、rows（标签/值）、variant: bar/line',
  diagram: 'label、bind（选择状态）、width、height、shapes：SVG图元数组；parts：{id,label,description}数组。可选 asset: bicycle 使用内置精细自行车SVG（可省略width/height/shapes/parts），explodeBind绑定0..1数值状态显示拆解滑块。图元支持strokeWidth、fill:none/text/surface、dx/dy拆解偏移。图元为 line/circle/rect/path/text，可用 part 对应部件 id。用图解释结构，不要用参数表代替图',
  timeline: 'label、items：{id,label,description,time?,bind?}数组，默认可勾选，省略bind时客户端自动管理并保存完成状态；bind可指定已有布尔状态；纯展示时间线设置checkable:false',
  app: 'label、code：在隔离 Worker 中运行的 JavaScript，使用 ui.render(原生文档)、ui.onEvent(fn)、ui.onTick(fn)、ui.state、ui.save(state)；没有 DOM/网络。render文档不能嵌套app，首次render须同步；事件为{key,value}。支持模拟、动态矢量图和小游戏',
} as const;
export const operationArity: Record<string, readonly [number, number]> = {
  add: [2, 20], mul: [2, 20], sub: [2, 2], div: [2, 2], round: [1, 1],
  concat: [1, 20], eq: [2, 2], if: [3, 3], pow: [2, 2], min: [1, 20], max: [1, 20],
  lt: [2, 2], gt: [2, 2], fixed: [2, 2],
};
export const catalogDescription = Object.entries(catalog).map(([name, description]) => `${name}: ${description}`).join('\n');

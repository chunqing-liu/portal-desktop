export const demoSource = JSON.stringify({
  version: 1, title: '团队预算计算器', state: { seats: 8, plan: '标准版', annual: false },
  body: [
    { id: 'intro', type: 'text', value: '调整人数和方案，费用会在本地即时更新。' },
    { id: 'seats', type: 'slider', label: '团队人数', bind: 'seats', min: 1, max: 50, step: 1 },
    { id: 'plan', type: 'select', label: '方案', bind: 'plan', options: ['标准版', '专业版'] },
    { id: 'annual', type: 'toggle', label: '年付优惠（八折）', bind: 'annual' },
    { id: 'total', type: 'metric', label: '每月费用（元）', value: { op: 'round', args: [{ op: 'mul', args: [{ state: 'seats' }, { op: 'if', args: [{ op: 'eq', args: [{ state: 'plan' }, '标准版'] }, 29, 59] }, { op: 'if', args: [{ state: 'annual' }, 0.8, 1] }] }] } },
    { id: 'comparison', type: 'chart', label: '方案月费比较（优惠前）', columns: ['方案', '费用'], rows: [['标准版', { op: 'mul', args: [{ state: 'seats' }, 29] }], ['专业版', { op: 'mul', args: [{ state: 'seats' }, 59] }]] },
    { id: 'reset', type: 'button', label: '恢复默认', action: 'reset' },
  ],
}, null, 2);
export const generationPrompt = `请为我的需求生成可交互界面，使用一个标记为 intelligent-ui 的 Markdown JSON 代码块。所有交互在客户端本地运行。
协议：{version:1,title:string,state:{状态名:字符串/数字/布尔值/null},body:组件数组}。
组件必须有唯一 id 和 type。支持 stack/row（children）、text/metric（label、value）、slider（label、bind、min、max、step）、input/select/toggle（label、bind，select 需 options 字符串数组）、table/chart（label、columns 字符串数组、rows 二维表达式数组，chart 两列分别为标签与数值）、button（label、action:"reset"）。bind 对应 state 的字段。
value 和单元格可用字面量、{"state":"字段名"} 或 {"op":"操作名","args":[表达式,...]}。操作支持 add/mul（2–20 项）、sub/div/eq（2 项）、round（1 项）、concat（1–20 项）、if（条件、真值、假值）。不要使用 JavaScript、HTML、函数、URL、外部依赖或其他属性。JSON 必须合法；状态字段用英文字母开头。说明文字放在代码块外。
示例：\n\`\`\`intelligent-ui\n${demoSource}\n\`\`\`\n\n我的需求：`;

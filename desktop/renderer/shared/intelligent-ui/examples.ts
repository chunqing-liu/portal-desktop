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

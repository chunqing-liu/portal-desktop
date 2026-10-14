import { designTokens, type Appearance } from './design';
import { bicycleAsset } from './bicycle-asset';
import { catalog, operationArity } from "./catalog";
/** A bounded JSON interpreter. Model output never becomes executable JavaScript. */
export type Value = string | number | boolean | null;
export type Expr = Value | { state: string } | { op: string; args: Expr[] };
export interface UINode {
  id: string;
  type: keyof typeof catalog;
  label?: string;
  description?: string;
  unit?: string;
  meta?: string;
  range?: boolean;
  copyable?: boolean;
  value?: Expr;
  bind?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  children?: UINode[];
  columns?: string[];
  rows?: Expr[][];
  action?: 'reset' | 'copy' | 'continue' | 'event' | 'set';
  changes?: Record<string, Expr>;
  when?: Expr;
  appearance?: Appearance;
  variant?: 'bar' | 'line' | 'two' | 'three' | 'collage' | 'primary' | 'quiet';
  level?: 2 | 3 | 4;
  width?: number;
  height?: number;
  shapes?: Shape[];
  parts?: { id: string; label: string; description: string }[];
  checkable?: boolean;
  items?: { id: string; label: string; description?: string; time?: string; bind?: string; group?: string; value?: Expr }[];
  code?: string;
  src?: string;
  asset?: 'bicycle';
  explodeBind?: string;
}
export interface Shape {
  type: 'line' | 'circle' | 'rect' | 'path' | 'text';
  x?: number; y?: number; x2?: number; y2?: number; r?: number; width?: number; height?: number;
  dx?: number; dy?: number; strokeWidth?: number; fill?: 'none' | 'text' | 'surface';
  d?: string; text?: string; part?: string; color?: 'accent' | 'muted' | 'text';
}
export interface UIDocument { version: 1; title: string; state: Record<string, Value>; body: UINode[] }
const owns = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
const keyOK = (key: string) => /^[a-zA-Z][\w-]{0,63}$/.test(key) && !['constructor', 'prototype', '__proto__'].includes(key);
const scalar = (v: unknown): v is Value => v === null || typeof v === 'boolean' || typeof v === 'string' && v.length <= 10000 || typeof v === 'number' && Number.isFinite(v);
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const operations = operationArity;
export function compileUI(source: string): UIDocument {
  if (source.length > 100000) throw new Error('界面描述超过 100 KB');
  const doc = JSON.parse(source);
  const fail = (message: string): never => { throw new Error(message); };
  if (!object(doc) || doc.version !== 1 || typeof doc.title !== 'string' || doc.title.length > 200 || !object(doc.state) || !Array.isArray(doc.body)) fail('需要 version: 1、title、state 和 body');
  if (Object.keys(doc.state).length > 50) fail('状态字段过多');
  for (const [key, value] of Object.entries(doc.state)) if (!keyOK(key) || !scalar(value)) fail('无效的状态字段');
  let budget = 0;
  function expr(value: unknown, depth = 0): void {
    if (++budget > 5000 || depth > 20) fail('表达式过于复杂');
    if (scalar(value)) return;
    if (!object(value)) fail('无效的表达式');
    const e = value as Record<string, any>;
    if (typeof e.state === 'string' && owns(doc.state, e.state) && Object.keys(e).length === 1) return;
    const arity = typeof e.op === 'string' && owns(operations, e.op) ? operations[e.op] : undefined;
    if (!arity || !Array.isArray(e.args) || e.args.length < arity[0] || e.args.length > arity[1]) fail('不支持的表达式操作');
    e.args.forEach((arg: unknown) => expr(arg, depth + 1));
  }
  const ids = new Set<string>();
  const types = new Set(Object.keys(catalog));
  function node(n: any, depth: number) {
    if (!object(n) || depth > 12 || ids.size >= 200 || typeof n.id !== 'string' || !keyOK(n.id) || ids.has(n.id) || !types.has(n.type)) fail('组件类型、层级或 id 无效');
    ids.add(n.id);
    const allowed = new Set(['id', 'type', 'label', 'value', 'bind', 'min', 'max', 'step', 'options', 'children', 'columns', 'rows', 'action', 'variant', 'width', 'height', 'shapes', 'parts', 'items', 'code', 'asset', 'explodeBind', 'src', 'checkable', 'level', 'changes', 'when', 'appearance', 'description', 'unit', 'meta', 'range', 'copyable']);
    const unknown = Object.keys(n).filter(key => !allowed.has(key));
    if (unknown.length) fail(`组件「${n.id}」（${n.type}）包含未知属性：${unknown.map(key => JSON.stringify(key).slice(0, 100)).join('、').slice(0, 400)}。${unknown.includes('parent') ? 'parent 是 node 事件的外层字段，须与 op、node 同级，不能放在 node 对象内。' : '请按组件目录检查字段名称和所在层级。'}`);
    if (n.label !== undefined && (typeof n.label !== 'string' || n.label.length > 500)) fail('组件标签无效');
    for (const field of ['description', 'unit', 'meta']) if (n[field] !== undefined && (typeof n[field] !== 'string' || n[field].length > 2000)) fail('说明字段无效');
    if (n.range !== undefined && (n.type !== 'stepper' || typeof n.range !== 'boolean')) fail('range仅适用于stepper');
    if (n.copyable !== undefined && (n.type !== 'checklist' || typeof n.copyable !== 'boolean')) fail('copyable仅适用于checklist');
    if (n.value !== undefined) expr(n.value);
    if (n.when !== undefined) { expr(n.when); if (typeof evaluate(n.when, doc.state) !== 'boolean') fail('when需要布尔表达式'); }
    if (n.appearance !== undefined) {
      if (!object(n.appearance)) fail('appearance需要设计属性对象');
      for (const [key, value] of Object.entries(n.appearance)) {
        if (key === 'span') { if (![1,2,3].includes(value as number)) fail('span必须为1到3'); }
        else if (!owns(designTokens, key) || !(designTokens[key as keyof typeof designTokens] as readonly unknown[]).includes(value)) fail(`不支持的设计属性：${key}`);
      }
    }
    if (n.changes !== undefined) {
      if (n.type !== 'button' || n.action !== 'set' || !object(n.changes) || !Object.keys(n.changes).length || Object.keys(n.changes).length > 20) fail('changes仅用于set按钮，包含1到20个状态更新');
      for (const [key, value] of Object.entries(n.changes)) {
        if (!owns(doc.state, key)) fail('set必须引用已声明状态');
        expr(value);
        const result = evaluate(value as Expr, doc.state);
        if (!scalar(result) || typeof result !== typeof doc.state[key]) fail('set不能改变状态类型');
      }
    }
    if (n.type === 'progress' && (!Number.isFinite(n.min) || !Number.isFinite(n.max) || n.min >= n.max || n.value === undefined || typeof evaluate(n.value, doc.state) !== 'number')) fail('progress需要数值表达式及有效min/max');
    if (n.type === 'choice') {
      if (typeof n.bind !== 'string' || !owns(doc.state,n.bind) || typeof doc.state[n.bind] !== 'string' || !Array.isArray(n.items) || !n.items.length || n.items.length > 30 || !n.items.some((item:any) => item?.id === doc.state[n.bind])) fail('choice需要文本选择及有效items');
    }
    if (['stepper', 'slider', 'number', 'input', 'select', 'segmented', 'toggle'].includes(n.type)) {
      if (typeof n.bind !== 'string' || !owns(doc.state, n.bind)) fail('输入组件需要有效的 bind');
      const initial = doc.state[n.bind];
      if (['stepper', 'slider', 'number'].includes(n.type) && (typeof initial !== 'number' || !Number.isFinite(n.min) || !Number.isFinite(n.max) || n.min >= n.max || initial < n.min || initial > n.max || n.step !== undefined && (!Number.isFinite(n.step) || n.step <= 0))) fail('滑块范围无效');
      if (n.type === 'toggle' && typeof initial !== 'boolean') fail('开关需要布尔状态');
      if (['input', 'select', 'segmented'].includes(n.type) && typeof initial !== 'string') fail('输入需要文本状态');
      if (['select', 'segmented'].includes(n.type) && (!Array.isArray(n.options) || !n.options.length || n.options.length > 100 || n.options.some((v: unknown) => typeof v !== 'string' || v.length > 500) || !n.options.includes(initial))) fail('选项无效');
    }
    if (n.type === 'button' && (!['reset', 'copy', 'continue', 'event', 'set'].includes(n.action) || n.action === 'set' && n.changes === undefined)) fail('不支持的动作');
    if ((['image', 'media'].includes(n.type) && (n.type === 'image' || n.src !== undefined)) && (typeof n.src !== 'string' || !(/^https:\/\/[^\s]+$/.test(n.src) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(n.src)))) fail('图片 src 仅支持 HTTPS 地址或 PNG/JPEG/WebP 的 Base64 位图；SVG 请使用 diagram 图元');
    if (n.type === 'app' && (typeof n.code !== 'string' || !n.code.trim() || n.code.length > 20000)) fail('应用代码无效或过长');
    if (n.variant !== undefined && !(n.type === 'chart' ? ['bar', 'line'] : n.type === 'gallery' ? ['collage', 'two', 'three'] : n.type === 'grid' ? ['two', 'three'] : n.type === 'button' ? ['primary', 'quiet'] : n.type === 'segmented' ? ['quiet'] : []).includes(n.variant)) fail('组件样式类型无效');
    if (n.level !== undefined && (n.type !== 'heading' || ![2, 3, 4].includes(n.level))) fail('标题层级无效');
    if (n.type === 'heading' && !n.label) fail('标题需要 label');
    if (n.type === 'facts' || n.type === 'breakdown') {
      if (!Array.isArray(n.rows) || n.rows.length > (n.type === 'breakdown' ? 8 : 100)) fail('数量列表无效');
      for (const row of n.rows) {
        if (!Array.isArray(row) || row.length !== 2) fail('数量列表需要名称和值两列');
        row.forEach((v: unknown) => expr(v));
      }
    }
    if (n.checkable !== undefined && (!['timeline', 'checklist'].includes(n.type) || typeof n.checkable !== 'boolean')) fail('勾选配置无效');
    if (['timeline', 'checklist', 'list', 'choice'].includes(n.type)) {
      if (!Array.isArray(n.items) || n.items.length > 100) fail('时间线无效');
      const keys = new Set();
      for (const item of n.items) {
        if (!object(item) || typeof item.id !== 'string' || !keyOK(item.id) || keys.has(item.id) || typeof item.label !== 'string' || item.label.length > 200 || item.description !== undefined && (typeof item.description !== 'string' || item.description.length > 2000) || item.bind !== undefined && (!owns(doc.state, item.bind) || typeof doc.state[item.bind] !== 'boolean')) fail('时间线项目无效');
        if (Object.keys(item).some(key => !['id', 'label', 'description', 'time', 'bind', 'group', 'value'].includes(key)) || item.time !== undefined && (typeof item.time !== 'string' || item.time.length > 80)) fail('清单项目属性无效');
        if (item.group !== undefined && (n.type !== 'checklist' || typeof item.group !== 'string' || item.group.length > 100)) fail('分组需要简短文本');
        if (item.value !== undefined) { if (n.type !== 'checklist') fail('行数值仅适用于checklist'); expr(item.value); }
        keys.add(item.id);
        if (!['list', 'choice'].includes(n.type) && n.checkable !== false && item.bind === undefined) {
          // Stable across reordering and stream updates; no keyword-specific rendering.
          let hash = 14695981039346656037n;
          for (const c of `${n.id}\0${item.id}`) hash = BigInt.asUintN(64, (hash ^ BigInt(c.codePointAt(0)!)) * 1099511628211n);
          const bind = `check-${hash.toString(16)}`;
          if (owns(doc.state, bind)) fail('自动勾选状态与已有字段冲突');
          if (Object.keys(doc.state).length >= 50) fail('状态字段过多');
          doc.state[bind] = false;
          item.bind = bind;
        }
      }
    }
    if (n.type === 'tabs' && (typeof n.bind !== 'string' || !owns(doc.state, n.bind) || typeof doc.state[n.bind] !== 'string')) fail('标签页需要文本选择状态');
    if (n.type === 'diagram') {
      if (n.asset !== undefined) { if (n.asset !== 'bicycle') fail('未知图解素材'); Object.assign(n, structuredClone(bicycleAsset)); }
      if (n.explodeBind !== undefined && (!owns(doc.state, n.explodeBind) || typeof doc.state[n.explodeBind] !== 'number' || doc.state[n.explodeBind] < 0 || doc.state[n.explodeBind] > 1)) fail('拆解状态需要 0 到 1 的数值');
      if (!Number.isFinite(n.width) || !Number.isFinite(n.height) || n.width < 1 || n.height < 1 || n.width > 2000 || n.height > 2000 || !Array.isArray(n.shapes) || n.shapes.length > 300 || !Array.isArray(n.parts) || n.parts.length > 40) fail('图解范围无效');
      if (typeof n.bind !== 'string' || !owns(doc.state, n.bind) || typeof doc.state[n.bind] !== 'string') fail('图解需要文本选择状态');
      const parts = new Set<string>();
      for (const part of n.parts) {
        if (!object(part) || typeof part.id !== 'string' || !keyOK(part.id) || parts.has(part.id) || typeof part.label !== 'string' || part.label.length > 100 || typeof part.description !== 'string' || part.description.length > 2000) fail('部件描述无效');
        parts.add(part.id);
      }
      for (const shape of n.shapes) {
        if (!object(shape) || !['line','circle','rect','path','text'].includes(shape.type)) fail('图元类型无效');
        // Common SVG-generator shorthand has the same bounded numeric semantics.
        if (shape.type === 'rect') for (const [short, full] of [['w', 'width'], ['h', 'height']]) {
          if (shape[short] !== undefined) {
            if (shape[full] !== undefined && shape[full] !== shape[short]) fail('矩形尺寸属性冲突');
            shape[full] = shape[short]; delete shape[short];
          }
        }
        for (const [key, value] of Object.entries(shape)) {
          if (['x','y','x2','y2','r','width','height','dx','dy','strokeWidth'].includes(key)) { if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 10000) fail('图元坐标无效'); }
          else if (key === 'fill') { if (!['none','text','surface'].includes(String(value))) fail('图元填充无效'); }
          else if (key === 'd') { if (typeof value !== 'string' || value.length > 10000 || !/^[MmLlHhVvCcSsQqTtAaZz0-9.,eE+\s-]*$/.test(value)) fail('路径无效'); }
          else if (key === 'text') { if (typeof value !== 'string' || value.length > 500) fail('图元文本无效'); }
          else if (key === 'part') { if (typeof value !== 'string' || !parts.has(value)) fail('图元部件引用无效'); }
          else if (key === 'color') { if (!['accent','muted','text'].includes(String(value))) fail('图元颜色无效'); }
          else if (key !== 'type') fail('未知图元属性');
        }
        const required: Record<string, string[]> = {line:['x','y','x2','y2'],circle:['x','y','r'],rect:['x','y','width','height'],path:['d'],text:['x','y','text']};
        if (required[shape.type].some(key => shape[key] === undefined)) fail('图元属性缺失');
        if (['r','width','height'].some(key => shape[key] !== undefined && shape[key] < 0)) fail('图元尺寸无效');
      }
    }
    if (n.type === 'table' || n.type === 'chart') {
      if (!Array.isArray(n.columns) || !n.columns.length || n.columns.length > 12 || n.columns.some((v: unknown) => typeof v !== 'string' || v.length > 200) || !Array.isArray(n.rows) || n.rows.length > 1000) fail('表格数据无效');
      if (n.type === 'chart' && n.columns.length !== 2) fail('图表需要标签和值两列');
      for (const row of n.rows) {
        if (!Array.isArray(row) || row.length !== n.columns.length) fail('数据列数不匹配');
        row.forEach((v: unknown) => expr(v));
      }
    }
    if (n.children !== undefined) {
      if (!['stack', 'row', 'card', 'section', 'grid', 'gallery', 'tabs', 'box', 'split'].includes(n.type) || !Array.isArray(n.children)) fail('仅容器支持 children');
      if (n.type === 'split' && n.children.length > 2) fail('split最多容纳两项内容');
      if (n.type === 'gallery' && (n.children.length > 6 || n.children.some((child: any) => child?.type !== 'image'))) fail('图库最多支持6张图片');
      if (n.type === 'tabs' && (n.children.length > 12 || n.children.some((child: any) => child?.type !== 'section' || !child.label) || n.children.length && !n.children.some((child: any) => child.id === doc.state[n.bind]))) fail('标签页需要带标题的section，选择值为子节点id');
      n.children.forEach((child: unknown) => node(child, depth + 1));
    }
  }
  doc.body.forEach((n: unknown) => node(n, 0));
  return doc as UIDocument;
}
export function evaluate(expr: Expr | undefined, state: Record<string, Value>): Value {
  if (expr === undefined) return '';
  if (scalar(expr)) return expr;
  if ('state' in expr) return owns(state, expr.state) ? state[expr.state] : null;
  const args = expr.args.map(arg => evaluate(arg, state));
  if (expr.op === 'concat') return args.map(v => v ?? '').join('').slice(0, 10000);
  if (expr.op === 'not') return !args[0];
  if (expr.op === 'and') return args.every(Boolean);
  if (expr.op === 'or') return args.some(Boolean);
  if (expr.op === 'eq') return args[0] === args[1];
  if (expr.op === 'if') return args[0] ? args[1] : args[2];
  if (!args.every(v => typeof v === 'number' && Number.isFinite(v))) return null;
  const nums = args as number[];
  if (expr.op === 'lt') return nums[0] < nums[1];
  if (expr.op === 'gt') return nums[0] > nums[1];
  if (expr.op === 'fixed') return nums[0].toFixed(Math.max(0, Math.min(10, Math.floor(nums[1]))));
  const value = expr.op === 'add' ? nums.reduce((a, b) => a + b, 0) : expr.op === 'mul' ? nums.reduce((a, b) => a * b, 1) : expr.op === 'sub' ? nums[0] - nums[1] : expr.op === 'div' ? nums[0] / nums[1] : expr.op === 'round' ? Math.round(nums[0]) : expr.op === 'pow' ? Math.pow(nums[0], nums[1]) : expr.op === 'min' ? Math.min(...nums) : expr.op === 'max' ? Math.max(...nums) : NaN;
  return Number.isFinite(value) ? value : null;
}
export function reconcileState(doc: UIDocument, previous: Record<string, Value>): Record<string, Value> {
  const next = { ...doc.state };
  for (const key of Object.keys(next)) if (owns(previous, key) && typeof previous[key] === typeof next[key]) next[key] = previous[key];
  function visit(nodes: UINode[]) {
    for (const n of nodes) {
      if (['stepper', 'slider', 'number'].includes(n.type)) next[n.bind!] = Math.max(n.min!, Math.min(n.max!, Number(next[n.bind!])));
      if (['select', 'segmented'].includes(n.type) && !n.options!.includes(String(next[n.bind!]))) next[n.bind!] = doc.state[n.bind!];
      if (n.type === 'tabs' && n.children?.length && !n.children.some(child => child.id === next[n.bind!])) next[n.bind!] = doc.state[n.bind!];
      if (n.type === 'choice' && !n.items!.some(item => item.id === next[n.bind!])) next[n.bind!] = doc.state[n.bind!];
      if (n.explodeBind) next[n.explodeBind] = Math.max(0, Math.min(1, Number(next[n.explodeBind])));
      if (n.children) visit(n.children);
    }
  }
  visit(doc.body);
  return next;
}

/** New model defaults may change computed data; retain only actual user choices. */
export function reconcileUpdatedState(doc: UIDocument, previousDoc: UIDocument, previous: Record<string, Value>, touched: ReadonlySet<string>): Record<string, Value> {
  const edited = Object.fromEntries(Object.entries(previous).filter(([key, value]) => touched.has(key) || value !== previousDoc.state[key]));
  return reconcileState(doc, edited);
}

/** Render only complete body components from a partial JSON stream. Never invent expression values. */
export function compileStreamingUI(source: string): UIDocument {
  try { return compileUI(source); } catch (error) {
    if (source.length > 100000) throw error;
    const stack: string[] = [];
    let quoted = false, escaped = false, stringStart = 0, bodyStart = -1;
    const candidates: number[] = [];
    for (let i = 0; i < source.length; i++) {
      const c = source[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') {
          quoted = false;
          if (stack.length === 1 && source.slice(stringStart, i + 1) === '"body"') {
            const suffix = source.slice(i + 1).match(/^\s*:\s*\[/);
            if (suffix) bodyStart = i + suffix[0].length;
          }
        }
        continue;
      }
      if (c === '"') { quoted = true; stringStart = i; continue; }
      if (c === '{' || c === '[') stack.push(c);
      else if (c === '}' || c === ']') {
        const open = stack.pop();
        if (open !== (c === '}' ? '{' : '[')) throw error;
        if (bodyStart >= 0 && i > bodyStart && c === '}' && stack.length === 2 && stack[1] === '[') candidates.push(i + 1);
      }
    }
    // A complete invalid document is an error, not a partial stream to repair.
    if (!stack.length) throw error;
    if (candidates.length) return compileUI(source.slice(0, candidates.at(-1)) + ']}');
    throw error;
  }
}

/** Evaluate all changes against the same prior snapshot, then clamp inputs. */
export function applyUIChanges(doc: UIDocument, values: Record<string, Value>, changes: Record<string, Expr>): Record<string, Value> {
  const patch: Record<string, Value> = {};
  for (const [key, expression] of Object.entries(changes)) {
    const result = evaluate(expression, values);
    if (!owns(doc.state, key) || !scalar(result) || typeof result !== typeof doc.state[key]) throw new Error('操作结果无效，已保留当前选择');
    patch[key] = result;
  }
  return reconcileState(doc, { ...values, ...patch });
}

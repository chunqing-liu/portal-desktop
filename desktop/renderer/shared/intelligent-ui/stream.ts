import { compileUI, compileStreamingUI, type UIDocument, type UINode, type Value } from './runtime';

/** Incremental JSON event decoder. Newlines inside a record are ordinary JSON whitespace. */
export class UIStream {
  private source = '';
  private tail = '';
  private jsonl = false;
  private scanned = 0;
  private brackets: string[] = [];
  private quoted = false;
  private escaped = false;
  private doc: UIDocument = { version: 1, title: '', state: {}, body: [] };
  private nodes = new Map<string, { node: UINode; parent?: string }>();
  private begun = false;
  private committed = false;
  private sequence = -1;
  private last: UIDocument | null = null;
  private error = '';
  private records = 0;
  private patching = false;
  constructor(private base?: UIDocument) {}
  reset() { this.scanned = 0; this.brackets = []; this.quoted = false; this.escaped = false; this.jsonl = false; this.source = ''; this.tail = ''; this.doc = { version: 1, title: '', state: {}, body: [] }; this.nodes.clear(); this.begun = false; this.committed = false; this.sequence = -1; this.last = null; this.error = ''; this.records = 0; this.patching = false; }
  update(source: string, streaming: boolean): { doc: UIDocument | null; error: string } {
    if (source.length > 200000) return { doc: this.last, error: '界面超过大小限制' };
    if (!source.startsWith(this.source)) this.reset();
    const delta = source.slice(this.source.length);
    this.source = source;
    // v1 compatibility, with explicit complete-component recovery.
    if (!/^\s*\{\s*"op"\s*:/.test(source)) {
      try { this.last = streaming ? compileStreamingUI(source) : compileUI(source); this.error = ''; }
      catch (e) { this.error = e instanceof Error ? e.message : '界面格式错误'; }
      return { doc: this.last, error: this.error };
    }
    if (!this.jsonl) { this.error = ''; this.tail = source; this.jsonl = true; } else this.tail += delta;
    const lines: string[] = [];
    let consumed = 0, scanned = this.tail.length;
    for (let i = this.scanned; i < this.tail.length; i++) {
      const c = this.tail[i];
      if (this.quoted) {
        if (this.escaped) this.escaped = false;
        else if (c === '\\') this.escaped = true;
        else if (c === '"') this.quoted = false;
        continue;
      }
      // Recover only at an explicit protocol event on a new line. Never repair expressions.
      if (this.brackets.length && c === '{' && /^\s*$/.test(this.tail.slice(this.tail.lastIndexOf('\n', i - 1) + 1, i))) {
        const remaining = this.tail.slice(i);
        if (streaming && !remaining.includes('\n')) { scanned = i; break; }
        if (/^\{\s*"op"\s*:\s*"(?:begin|state|node|remove|commit)"/.test(remaining)) {
          this.error ||= '有界面事件缺少闭合括号，已跳过；请让 Being 修正生成内容';
          this.brackets = []; consumed = i;
        }
      }
      if (!this.brackets.length && /\s/.test(c)) { consumed = i + 1; continue; }
      if (!this.brackets.length && c !== '{') {
        this.error = '界面事件必须是 JSON 对象';
        consumed = i + 1;
        continue;
      }
      if (c === '"') this.quoted = true;
      else if (c === '{' || c === '[') this.brackets.push(c);
      else if (c === '}' || c === ']') {
        const open = this.brackets.pop();
        if (open !== (c === '}' ? '{' : '[')) {
          this.error = '界面事件的括号不匹配';
          this.brackets = [];
          consumed = i + 1;
          continue;
        }
        if (!this.brackets.length) { lines.push(this.tail.slice(consumed, i + 1)); consumed = i + 1; }
      }
    }
    this.tail = this.tail.slice(consumed);
    this.scanned = scanned - consumed;
    if (!streaming && this.tail.trim()) this.error = '生成中断：最后一个界面事件未完成，已保留完整内容';
    if (!lines.length && streaming) return { doc: this.last, error: this.error };
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        if (++this.records > 5000) throw new Error('界面事件过多');
        const record = JSON.parse(line);
        if (record === null || typeof record !== 'object' || Array.isArray(record)) throw new Error('事件格式无效');
        if (record.seq !== undefined) {
          if (!Number.isSafeInteger(record.seq) || record.seq < 0) throw new Error('事件序号无效');
          if (record.seq <= this.sequence) continue;
          this.sequence = record.seq;
        }
        if (this.committed) throw new Error('界面已结束');
        if (record.op === 'begin') {
          const title = record.title === undefined && record.mode === 'patch' ? this.base?.title : record.title;
          if (this.begun || record.version !== 2 || typeof title !== 'string' || title.length > 200) throw new Error('无效的 begin');
          if (record.surfaceId !== undefined && (typeof record.surfaceId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(record.surfaceId))) throw new Error('surfaceId 需为 1–128 位字母、数字、下划线或连字符');
          if (record.mode !== undefined && !['replace', 'patch'].includes(record.mode)) throw new Error('界面更新 mode 必须为 replace 或 patch');
          if (record.baseRevision !== undefined && (!Number.isSafeInteger(record.baseRevision) || record.baseRevision < 1)) throw new Error('baseRevision 必须是当前界面的正整数版本号');
          this.patching = record.mode === 'patch';
          if (this.patching) {
            if (!this.base) throw new Error('增量更新缺少原界面，请提供对应 surfaceId 的当前版本');
            this.doc = { ...this.base, state: { ...this.base.state }, body: [] };
            const seed = (nodes: UINode[], parent?: string) => {
              for (const { children, ...node } of nodes) {
                this.nodes.set(node.id, { node, parent });
                if (children) seed(children, node.id);
              }
            };
            seed(this.base.body);
          }
          this.begun = true; this.doc.title = title;
        } else {
          if (!this.begun) throw new Error('缺少 begin');
          if (record.op === 'state') {
            if (typeof record.key !== 'string' || !/^[A-Za-z][\w-]{0,63}$/.test(record.key) || ['constructor','prototype','__proto__'].includes(record.key)) throw new Error('无效的状态键');
            const candidate = { ...this.doc.state, [record.key]: record.initial as Value };
            compileUI(JSON.stringify({ ...this.doc, state: candidate, body: [] }));
            this.doc.state = candidate;
          } else if (record.op === 'node') {
            const n = record.node;
            if (!n || typeof n.id !== 'string' || record.parent !== undefined && typeof record.parent !== 'string') throw new Error('无效的节点');
            if (this.patching) {
              const inheritChecks = (node: UINode) => {
                const previous = this.nodes.get(node.id)?.node;
                if (['timeline', 'checklist'].includes(node.type) && previous && ['timeline', 'checklist'].includes(previous.type) && Array.isArray(node.items)) {
                  for (const item of node.items) {
                    if (item && typeof item === 'object' && item.bind === undefined) {
                      const bind = previous.items?.find(old => old.id === item.id)?.bind;
                      if (bind !== undefined) item.bind = bind;
                    }
                  }
                }
                if (Array.isArray(node.children)) for (const child of node.children) if (child && typeof child === 'object') inheritChecks(child);
              };
              inheritChecks(n);
            }
            // Validate this node before it can poison subsequent valid updates.
            compileUI(JSON.stringify({ ...this.doc, body: [n] }));
            if (!this.nodes.has(n.id) && this.nodes.size >= 200) throw new Error('组件过多');
            const parent = record.parent === undefined ? this.nodes.get(n.id)?.parent : record.parent;
            if (this.patching && n.children !== undefined) {
              // An explicit children list replaces that subtree. Flatten it so
              // subsequent node/remove events can address its children by id.
              const drop = (id: string, seen = new Set<string>()) => {
                if (seen.has(id)) return;
                seen.add(id);
                for (const [child, entry] of this.nodes) if (entry.parent === id) { drop(child, seen); this.nodes.delete(child); }
              };
              drop(n.id);
              const put = ({ children, ...node }: UINode, parent?: string) => {
                this.nodes.set(node.id, { node: children ? { ...node, children: [] } : node, parent });
                for (const child of children || []) put(child, node.id);
              };
              put(n, parent);
            } else this.nodes.set(n.id, { node: n, parent });
          } else if (record.op === 'remove') {
            if (typeof record.id !== 'string' || !this.nodes.has(record.id)) throw new Error('remove 需要已存在的组件 id');
            const remove = (id: string, visited = new Set<string>()) => {
              if (visited.has(id)) return;
              visited.add(id);
              for (const [child, entry] of this.nodes) if (entry.parent === id) remove(child, visited);
              this.nodes.delete(id);
            };
            remove(record.id);
          } else if (record.op === 'commit') this.committed = true;
          else throw new Error('未知事件');
        }
      } catch (e) { this.error = e instanceof Error ? e.message : '事件格式错误'; }
    }
    if (this.begun) {
      try {
        const visited = new Set<string>();
        const visit = (parent?: string, path = new Set<string>()): UINode[] => {
          if (path.size > 12) throw new Error('节点嵌套过深');
          return [...this.nodes.values()].filter(n => n.parent === parent).map(({ node }) => {
            visited.add(node.id);
            if (path.has(node.id)) throw new Error('节点引用循环');
            const children = visit(node.id, new Set([...path, node.id]));
            return children.length ? { ...node, children: [...(node.children || []), ...children] } : node;
          });
        };
        const body = visit();
        if (this.committed && visited.size !== this.nodes.size) throw new Error('有组件缺少父节点或存在循环引用');
        this.last = compileUI(JSON.stringify({ ...this.doc, body }));
        if (!streaming) {
          if (!this.committed) this.error ||= '生成中断：保留已完成的界面';
          for (const { parent } of this.nodes.values()) if (parent && !this.nodes.has(parent)) this.error ||= '有组件缺少父节点';
        }
      } catch (e) { this.error = e instanceof Error ? e.message : '界面格式错误'; }
    }
    return { doc: this.last, error: this.error };
  }
}

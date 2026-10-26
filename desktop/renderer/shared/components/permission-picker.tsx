import type { PermissionMode } from '../../../shared/security';
export const permissionChoices: { value: PermissionMode; title: string; detail: string; icon: string; tag?: string }[] = [
  { value: 'read-only', title: '只读', detail: '查看文件与分析代码。子代理也只能读取。', icon: 'read' },
  { value: 'supervised', title: '安全协作', detail: '允许工作区编辑，执行命令与外部操作前询问。', icon: 'shield', tag: '推荐' },
  { value: 'full-access', title: '完全信任', detail: '关闭审批与命令沙箱，允许使用本机权限。', icon: 'unlock' },
];
export function PermissionIcon({ kind = 'shield' }: { kind?: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'read' ? <><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h3"/></> : kind === 'unlock'
      ? <><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M9 10V7a4 4 0 0 1 7-2M12 14v3"/></>
      : <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></>}
  </svg>;
}
export function PermissionPicker({ value, onChange, disabled = false }: { value: PermissionMode; onChange: (mode: PermissionMode) => void; disabled?: boolean }) {
  return <div className="permission-picker" role="radiogroup" aria-label="工具权限模式">
    {permissionChoices.map((choice, index) => <button key={choice.value} type="button" role="radio" aria-checked={value === choice.value} tabIndex={value === choice.value ? 0 : -1}
      onKeyDown={event => {
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? permissionChoices.length - 1
          : (index + (event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1) + permissionChoices.length) % permissionChoices.length;
        onChange(permissionChoices[next].value);
        (event.currentTarget.parentElement?.children[next] as HTMLButtonElement)?.focus();
      }}
      disabled={disabled} className={`permission-choice${value === choice.value ? ' selected' : ''}`} onClick={() => onChange(choice.value)}>
      <span className="permission-choice-icon"><PermissionIcon kind={choice.icon}/></span>
      <span className="permission-choice-copy"><span className="permission-choice-title">{choice.title}{choice.tag && <em>{choice.tag}</em>}</span><span className="permission-choice-detail">{choice.detail}</span></span>
      <span className="permission-radio" aria-hidden="true">{value === choice.value ? '●' : ''}</span>
    </button>)}
  </div>;
}

export type PermissionMode = 'read-only' | 'supervised' | 'full-access';
export interface ToolApprovalView { id: string; title: string; message: string; detail: string; expiresAt: number }
export function permissionMode(value: unknown): PermissionMode {
  if (value === undefined) return 'supervised';
  if (value === 'read-only' || value === 'supervised' || value === 'full-access') return value;
  throw new Error('无效的工具权限模式。');
}

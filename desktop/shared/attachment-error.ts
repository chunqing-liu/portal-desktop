/** Never expose signed URLs or credentials from transport exceptions. */
export function attachmentError(error: unknown): string {
  const value = error as {name?: string; message?: string; code?: string; cause?: unknown} | undefined;
  if (value?.name === 'TimeoutError') return '请求超时，请重试';
  if (value?.name === 'AbortError') return '上传已取消或连接已中断';
  const message = typeof value?.message === 'string' ? value.message : '未知错误';
  const safe = message.replace(/https?:\/\/[^\s"'<>]+/gi, '[服务地址]')
    .replace(/(Bearer\s+)\S+/gi, '$1[已隐藏]')
    .replace(/((?:token|secret|signature|authorization|credential)[\w-]*\s*[=:]\s*)[^\s&,;]+/gi, '$1[已隐藏]');
  const code = typeof value?.code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(value.code) ? value.code : '';
  const cause = value?.cause && value.cause !== error ? attachmentErrorCause(value.cause) : '';
  return [safe.slice(0, 300), code, cause].filter(Boolean).join('；');
}
function attachmentErrorCause(cause: unknown): string {
  const value = cause as {code?: unknown; name?: unknown};
  return typeof value?.code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(value.code) ? value.code : '';
}

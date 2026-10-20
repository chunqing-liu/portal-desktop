/** A local reference, never a network URL. Relative paths resolve against the Portal workspace. */
export function localFileReference(value: unknown, decodeURLPath = false): string | undefined {
  if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)) return;
  let file = value.trim();
  if (/^file:/i.test(file)) {
    try {
      const url = new URL(file);
      if (url.hostname && url.hostname !== 'localhost') return;
      file = decodeURIComponent(url.pathname);
      if (/^\/[a-z]:\//i.test(file)) file = file.slice(1);
    } catch { return; }
  } else {
    if (/^[a-z][a-z\d+.-]*:/i.test(file) && !/^[a-z]:[\\/]/i.test(file)) return;
    // Markdown URLs can encode spaces and Unicode. Do not decode literal paths twice.
    if (decodeURLPath) { try { file = decodeURIComponent(file); } catch { /* A literal percent is a valid filename. */ } }
  }
  file = file.replace(/(?::\d+(?::\d+)?|#L\d+(?:-L?\d+)?)$/, '');
  if (!file || /[\x00-\x1f\x7f]/.test(file) || /^(?:\/\/|\\\\)/.test(file)) return;
  // Require a filename extension so ordinary inline code is not turned into a link.
  if (!/(?:^|[\\/])[^\\/]+\.[a-z\d]{1,16}$/i.test(file) || /[<>"|?*]/.test(file)) return;
  return file;
}

export interface LocalFilePreview {
  id: string;
  path: string;
  name: string;
  extension: string;
  text?: string;
  bytes?: Uint8Array;
  mime?: string;
  url?: string;
}

export type LocalFileRevealResult = { ok: true } | {
  ok: false;
  reason: 'missing' | 'permission' | 'invalid-path';
};

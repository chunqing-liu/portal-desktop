export const MAX_PLUGIN_ICON_BYTES = 256 * 1024;
export const PLUGIN_ICON_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };
const imageData = /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,([A-Za-z0-9+/]+={0,2})$/;
export function isPluginIconText(value: string): boolean {
  return [...value].length <= 16 && value.length > 0 && !/[\s\x00-\x1f\x7f<>/\\:.]/u.test(value);
}
export function isPluginIconPath(value: string): boolean {
  return value.length <= 240 && /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp|svg)$/i.test(value);
}
export function parsePluginIcon(value: unknown, allowPath = true): string {
  if (typeof value !== 'string') throw new Error('图标必须是 Emoji、短文字或图片。');
  if (isPluginIconText(value) || (allowPath && isPluginIconPath(value))) return value;
  if (value.length <= Math.ceil(MAX_PLUGIN_ICON_BYTES / 3) * 4 + 40) {
    const match = imageData.exec(value);
    if (match && match[1].length % 4 === 0 && match[1].length / 4 * 3 - (match[1].endsWith('==') ? 2 : match[1].endsWith('=') ? 1 : 0) <= MAX_PLUGIN_ICON_BYTES) return value;
  }
  throw new Error('图标需为不超过 16 个字符的 Emoji / 短文字，或不超过 256 KB 的 PNG、JPEG、WebP、SVG 图片。');
}

export const MAX_REMOTE_IMAGE_BYTES = 128 * 1024 * 1024;
export const REMOTE_IMAGE_MIME = /^image\/(png|jpeg|gif|webp|avif)$/;

/** Decode only raster data URLs; never navigate the shell to generated content. */
export function inlineImageBlob(src: string): Blob | undefined {
  if (src.length > MAX_REMOTE_IMAGE_BYTES * 4 / 3 + 128) return;
  const match = /^data:(image\/(?:png|jpeg|gif|webp|avif));base64,([A-Za-z0-9+/=]+)$/.exec(src);
  if (!match) return;
  try {
    const bytes = Uint8Array.from(atob(match[2]), char => char.charCodeAt(0));
    if (bytes.byteLength <= MAX_REMOTE_IMAGE_BYTES) return new Blob([bytes], {type:match[1]});
  } catch { /* Invalid Base64 is not a preview source. */ }
}

export function remoteImageURL(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 16384) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch { /* Incomplete or unsupported image URL. */ }
}

export function remoteImageSource(url: string, desktop: boolean) {
  return desktop ? '/api/remote-image?' + new URLSearchParams({ url }) : url;
}

export function remoteImageName(label: string, mime: string) {
  const extension = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif' } as Record<string, string>)[mime] || 'png';
  const name = label.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100) || '图片';
  return `${name.replace(/\.(png|jpe?g|gif|webp|avif)$/i, '')}.${extension}`;
}

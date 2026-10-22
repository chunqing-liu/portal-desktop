import { remoteImageURL } from './remote-image';

export type ImageGalleryItem = { src: string; name: string };
export type ImageGallery = { id: string; items: ImageGalleryItem[] };

/** Validate gallery messages crossing from the chat frame into the desktop shell. */
export function imageGallery(value: unknown): ImageGallery | null {
  if (!value || typeof value !== 'object') return null;
  const { id, items } = value as ImageGallery;
  if (typeof id !== 'string' || !id || id.length > 256 || !Array.isArray(items) || items.length > 384) return null;
  const seen = new Set<string>(), result: ImageGalleryItem[] = [];
  for (const item of items) {
    const src = remoteImageURL(item?.src);
    if (!src || typeof item?.name !== 'string') return null;
    if (!seen.has(src)) { seen.add(src); result.push({ src, name: item.name.slice(0, 512) }); }
  }
  return { id, items: result };
}

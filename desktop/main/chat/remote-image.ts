import { MAX_REMOTE_IMAGE_BYTES, REMOTE_IMAGE_MIME, remoteImageURL } from '../../shared/remote-image';

/** Use Node fetch: Electron net.fetch rejects manual redirects instead of returning the 302.
 * Fetch image bytes without forwarding the Being token, cookies or request headers. */
export async function remoteImage(request: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'GET') return new Response(null, { status: 405 });
  const initial = remoteImageURL(new URL(request.url).searchParams.get('url'));
  if (!initial) return new Response(null, { status: 400 });
  let url: string = initial;
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60000)]);
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      const response = await fetcher(url, { signal, redirect: 'manual', credentials: 'omit', headers: { Accept: 'image/*' } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        const next = location && remoteImageURL(new URL(location, url).href);
        if (!next) throw new Error('Invalid image redirect');
        url = next;
        continue;
      }
      const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
      if (!response.ok || !REMOTE_IMAGE_MIME.test(mime) || Number(response.headers.get('content-length')) > MAX_REMOTE_IMAGE_BYTES || !response.body) {
        await response.body?.cancel();
        throw new Error('Invalid image response');
      }
      const reader = response.body.getReader(), chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > MAX_REMOTE_IMAGE_BYTES) throw new Error('Image too large');
          chunks.push(chunk.value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      return new Response(Buffer.concat(chunks), { headers: {
        'Content-Type': mime, 'Content-Length': String(size), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      } });
    }
  } catch { /* Do not expose signed image URLs in error messages. */ }
  return Response.json({ error: '图片暂时无法加载，请稍后重试' }, { status: 502 });
}

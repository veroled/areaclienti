/**
 * GET /api/media/{key}   (pubblico, senza auth)
 *   Serve i file caricati su R2 (binding MEDIA). Pubblico di proposito: VNNOX e i
 *   ledwall devono poterli scaricare. Le key sono UUID non indovinabili.
 *
 * Route catch-all di Pages Functions: params.path = segmenti dopo /api/media/.
 */

interface R2Object {
  body: ReadableStream;
  writeHttpMetadata(headers: Headers): void;
  httpEtag: string;
}
interface R2Bucket {
  get(key: string): Promise<R2Object | null>;
}
interface Env {
  MEDIA?: R2Bucket;
}

export const onRequestGet = async (ctx: { params: { path?: string | string[] }; env: Env }): Promise<Response> => {
  const { params, env } = ctx;
  if (!env.MEDIA) return new Response('Storage non configurato', { status: 503 });

  const key = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');
  if (!key) return new Response('Not found', { status: 404 });

  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('etag', obj.httpEtag);
  return new Response(obj.body, { headers });
};

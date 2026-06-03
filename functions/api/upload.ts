/**
 * POST /api/upload   (multipart NON necessario: invia il file come body grezzo)
 *   Headers: content-type del file, x-filename (nome originale, URL-encoded)
 *   → carica il media su R2 (binding MEDIA) e restituisce un URL pubblico servito
 *     da /api/media/{key}. Usato dal Compositore per immagini/video.
 *
 * Auth: richiede sessione portale. Multi-tenant: la key è prefissata con la P.IVA.
 * Se il binding R2 manca, risponde 503 (l'editor tiene l'anteprima locale).
 */

import { requireClient, type PortaleEnv } from '../_lib/portaleauth';

interface R2Bucket {
  put(key: string, value: ReadableStream | ArrayBuffer | null, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
}
interface Env extends PortaleEnv {
  MEDIA?: R2Bucket;
}

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

function extOf(name: string, type: string): string {
  const m = /\.([a-z0-9]{2,5})$/i.exec(name || '');
  if (m) return m[1].toLowerCase();
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  };
  return map[type] || 'bin';
}

export const onRequestPost = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = ctx;
  const client = await requireClient(env, request);
  if (!client) return json({ ok: false, error: 'non_autenticato' }, 401);
  if (!env.MEDIA) return json({ ok: false, error: 'storage_media_non_configurato' }, 503);

  const contentType = request.headers.get('content-type') || 'application/octet-stream';
  if (!/^image\/|^video\//.test(contentType)) return json({ ok: false, error: 'tipo_non_supportato' }, 415);

  const len = Number(request.headers.get('content-length') || 0);
  if (len && len > MAX_BYTES) return json({ ok: false, error: 'file_troppo_grande' }, 413);

  const filename = decodeURIComponent(request.headers.get('x-filename') || 'file');
  const key = `${client.piva}/${crypto.randomUUID()}.${extOf(filename, contentType)}`;

  try {
    await env.MEDIA.put(key, request.body, { httpMetadata: { contentType } });
  } catch {
    return json({ ok: false, error: 'upload_fallito' }, 502);
  }
  return json({ ok: true, key, url: `/api/media/${key}` });
};

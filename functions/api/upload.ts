/**
 * POST /api/upload   (file come body grezzo)
 *   Headers: content-type del file, x-filename (URL-encoded)
 *   → carica il media su R2 (binding MEDIA), calcola md5 + size (richiesti dai
 *     widget VNNOX) e restituisce { ok, key, url, md5, size }.
 *
 * Auth: sessione portale. Multi-tenant: key prefissata con la P.IVA.
 * Bufferizza il file per calcolare l'md5 (WebCrypto non ha MD5) → limite prudente.
 */

import { requireClient, type PortaleEnv } from '../_lib/portaleauth';
import { md5Hex } from '../_lib/md5';

interface R2Bucket {
  put(key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
}
interface Env extends PortaleEnv {
  MEDIA?: R2Bucket;
}

const MAX_BYTES = 80 * 1024 * 1024; // 80 MB (il file viene bufferizzato per l'md5)

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

  const buf = await request.arrayBuffer();
  const size = buf.byteLength;
  if (!size) return json({ ok: false, error: 'file_vuoto' }, 400);
  if (size > MAX_BYTES) return json({ ok: false, error: 'file_troppo_grande' }, 413);

  const md5 = md5Hex(new Uint8Array(buf));
  const filename = decodeURIComponent(request.headers.get('x-filename') || 'file');
  const key = `${client.piva}/${crypto.randomUUID()}.${extOf(filename, contentType)}`;

  try {
    await env.MEDIA.put(key, buf, { httpMetadata: { contentType } });
  } catch {
    return json({ ok: false, error: 'upload_fallito' }, 502);
  }
  return json({ ok: true, key, url: `/api/media/${key}`, md5, size });
};

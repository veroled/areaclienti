/**
 * POST /api/publish
 *   Body: { screens:[id], duration, ratio, bg, elements:[{type,x,y,w,h,...}] }
 *   Pubblica la composizione del Compositore sugli schermi del cliente.
 *
 * Multi-tenant: si pubblica solo sugli schermi del cliente autenticato.
 * Mock: accetta e conferma. Live: TODO mappare su VNNOX Media program/normal
 *   (pagine con widget image/video/text); richiede media ospitati (URL pubblici),
 *   quindi gli elementi con file locale (src null) non sono pubblicabili in live.
 */

import { requireClient, type PortaleEnv } from '../_lib/portaleauth';
import { vnnoxMode, type VnnoxEnv } from '../_lib/vnnox';

type Env = PortaleEnv & VnnoxEnv;

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

interface Element { type?: string; src?: string | null; }

export const onRequestPost = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = ctx;
  const client = await requireClient(env, request);
  if (!client) return json({ ok: false, error: 'non_autenticato' }, 401);

  let body: { screens?: string[]; elements?: Element[]; duration?: number };
  try { body = (await request.json()) as typeof body; } catch { return json({ ok: false, error: 'body_non_valido' }, 400); }

  const requested = Array.isArray(body.screens) ? body.screens : [];
  const allowed = new Set(client.screens);
  const targets = requested.filter((id) => allowed.has(id));
  if (!targets.length) return json({ ok: false, error: 'nessuno_schermo_valido' }, 400);
  if (!Array.isArray(body.elements) || !body.elements.length) return json({ ok: false, error: 'composizione_vuota' }, 400);

  const mode = vnnoxMode(env);
  if (mode === 'mock') {
    return json({ ok: true, mode, published: targets.length });
  }

  // LIVE — TODO: costruire il program VNNOX dagli elementi e POST /v2/player/program/normal.
  // Per ora non pubblichiamo davvero in live (evitiamo di fingere): segnaliamo che serve
  // il cablaggio del mapping + upload media su storage pubblico.
  const localOnly = body.elements.some((e) => (e.type === 'image' || e.type === 'video') && !e.src);
  return json({
    ok: false,
    mode,
    error: localOnly ? 'media_locale_non_pubblicabile' : 'live_publish_in_arrivo',
  }, 501);
};

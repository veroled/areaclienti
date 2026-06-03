/**
 * /api/portale/login
 *   POST   { identifier, password }  → login (P.IVA o email) → cookie sessione
 *   GET                              → stato sessione corrente ({ authed, nome })
 *   DELETE                           → logout (cancella cookie)
 *
 * Auth cliente del portale (vedi _lib/portaleauth.ts). Distinto dall'admin.
 */

import {
  verifyLogin,
  createSession,
  sessionCookie,
  clearCookie,
  requireClient,
  type PortaleEnv,
} from '../_lib/portaleauth';

function json(body: object, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

export const onRequestPost = async (ctx: { request: Request; env: PortaleEnv }): Promise<Response> => {
  const { request, env } = ctx;

  let body: { identifier?: string; password?: string };
  try { body = (await request.json()) as typeof body; } catch { return json({ ok: false, error: 'body_non_valido' }, 400); }

  const identifier = (body.identifier || '').trim();
  const password = body.password || '';
  if (!identifier || !password) return json({ ok: false, error: 'credenziali_mancanti' }, 400);

  // Il login demo non richiede KV; gli altri sì.
  const rec = await verifyLogin(env, identifier, password);
  if (!rec) {
    if (!env.VEROLED_KV) return json({ ok: false, error: 'storage_non_configurato' }, 503);
    return json({ ok: false, error: 'credenziali_errate' }, 401);
  }

  const token = await createSession(env, rec.piva);
  return json({ ok: true, nome: rec.nome }, 200, { 'Set-Cookie': sessionCookie(token) });
};

export const onRequestGet = async (ctx: { request: Request; env: PortaleEnv }): Promise<Response> => {
  const rec = await requireClient(ctx.env, ctx.request);
  if (!rec) return json({ authed: false });
  return json({ authed: true, nome: rec.nome, piva: rec.piva, screens: rec.screens.length });
};

export const onRequestDelete = async (): Promise<Response> => {
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
};

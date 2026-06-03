/**
 * Gestione accessi al PORTALE CLIENTI (lato admin).
 *   GET    /api/admin/portale-clienti           → lista clienti portale (senza hash)
 *   POST   /api/admin/portale-clienti           → upsert { piva, email, nome, password?, screens? }
 *   DELETE /api/admin/portale-clienti?piva=...   → revoca accesso
 *
 * Protetto da x-admin-secret. Qui l'admin associa a ogni cliente i PROPRI schermi
 * VNNOX (array di ID) e imposta la password iniziale del portale.
 */

import { upsertClient, getClient, type PortaleEnv, type PortaleClient } from '../../_lib/portaleauth';

interface Env extends PortaleEnv {
  ADMIN_SECRET?: string;
}

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
function auth(request: Request, env: Env): boolean {
  const h = request.headers.get('x-admin-secret') || '';
  return Boolean(env.ADMIN_SECRET) && h === env.ADMIN_SECRET;
}
function safe(c: PortaleClient) {
  const { salt: _s, hash: _h, ...rest } = c;
  return rest;
}

export const onRequestGet = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = ctx;
  if (!auth(request, env)) return json({ ok: false, error: 'non_autorizzato' }, 401);
  if (!env.VEROLED_KV) return json({ ok: false, error: 'kv_non_configurato' }, 503);

  const piva = (new URL(request.url).searchParams.get('piva') || '').trim();
  if (piva) {
    const c = await getClient(env, piva);
    return json({ ok: true, cliente: c ? safe(c) : null });
  }
  const { keys } = await env.VEROLED_KV.list({ prefix: 'portale:cliente:' });
  const clienti = [];
  for (const k of keys) {
    const raw = await env.VEROLED_KV.get(k.name);
    if (raw) clienti.push(safe(JSON.parse(raw) as PortaleClient));
  }
  return json({ ok: true, clienti });
};

export const onRequestPost = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = ctx;
  if (!auth(request, env)) return json({ ok: false, error: 'non_autorizzato' }, 401);
  if (!env.VEROLED_KV) return json({ ok: false, error: 'kv_non_configurato' }, 503);

  let body: { piva?: string; email?: string; nome?: string; password?: string; screens?: string[] };
  try { body = (await request.json()) as typeof body; } catch { return json({ ok: false, error: 'body_non_valido' }, 400); }

  const r = await upsertClient(env, {
    piva: body.piva || '',
    email: body.email || '',
    nome: body.nome || '',
    password: body.password,
    screens: Array.isArray(body.screens) ? body.screens.map((s) => String(s).trim()).filter(Boolean) : undefined,
  });
  return json(r, r.ok ? 200 : 400);
};

export const onRequestDelete = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = ctx;
  if (!auth(request, env)) return json({ ok: false, error: 'non_autorizzato' }, 401);
  if (!env.VEROLED_KV) return json({ ok: false, error: 'kv_non_configurato' }, 503);

  const piva = (new URL(request.url).searchParams.get('piva') || '').replace(/\s/g, '').toUpperCase();
  if (!piva) return json({ ok: false, error: 'piva_mancante' }, 400);
  await env.VEROLED_KV.delete(`portale:cliente:${piva}`);
  return json({ ok: true });
};

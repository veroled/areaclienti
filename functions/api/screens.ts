/**
 * GET /api/portale/screens
 *   → schermi del cliente autenticato (filtrati sui PROPRI ID = multi-tenant).
 *   Risponde { ok, mode, screens } dove mode = 'mock' | 'live' per il badge DEMO.
 *
 *   Luminosità/volume (live) arrivano in modo asincrono: qui si leggono dalla cache
 *   KV popolata da /api/portale/vnnox-callback e, in live, si lancia un refresh.
 *
 * Richiede sessione portale (cookie vl_portale). Vedi _lib/portaleauth.ts.
 */

import { requireClient, type PortaleEnv } from '../_lib/portaleauth';
import { getScreens, requestRunningStatus, vnnoxMode, VnnoxError, type VnnoxEnv, type ScreenStatusCache } from '../_lib/vnnox';

type Env = PortaleEnv & VnnoxEnv & { VNNOX_CALLBACK_TOKEN?: string };

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const onRequestGet = async (ctx: { request: Request; env: Env; waitUntil?: (p: Promise<unknown>) => void }): Promise<Response> => {
  const { request, env } = ctx;
  const client = await requireClient(env, request);
  if (!client) return json({ ok: false, error: 'non_autenticato' }, 401);

  try {
    // Cache dei valori asincroni (luminosità/volume) salvati dai callback VNNOX.
    const cache: ScreenStatusCache = {};
    if (env.VEROLED_KV && client.screens.length) {
      for (const id of client.screens) {
        try {
          const raw = await env.VEROLED_KV.get(`vnnox:status:${id}`);
          if (raw) { const v = JSON.parse(raw) as { brightness?: number; volume?: number }; cache[id] = { brightness: v.brightness, volume: v.volume }; }
        } catch { /* ignora cache mancante */ }
      }
    }

    const screens = await getScreens(env, client.screens, cache);

    // In live, chiede a VNNOX di aggiornare luminosità/volume (risposta via callback).
    if (vnnoxMode(env) === 'live' && client.screens.length) {
      const origin = new URL(request.url).origin;
      const noticeUrl = `${origin}/api/portale/vnnox-callback?token=${encodeURIComponent(env.VNNOX_CALLBACK_TOKEN || '')}`;
      const refresh = requestRunningStatus(env, client.screens, noticeUrl).catch(() => {});
      if (ctx.waitUntil) ctx.waitUntil(refresh);
    }

    return json({ ok: true, mode: vnnoxMode(env), screens });
  } catch (e) {
    const err = e as VnnoxError;
    return json({ ok: false, error: 'vnnox_error', detail: err.message }, err.status || 502);
  }
};

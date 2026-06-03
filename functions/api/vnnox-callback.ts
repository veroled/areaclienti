/**
 * POST /api/portale/vnnox-callback?token=...
 *
 * Riceve i callback ASINCRONI di VNNOX (running-status: luminosità/volume) e
 * salva i valori in KV per ogni player, così la dashboard li mostra al refresh.
 *
 * VNNOX non invia la nostra sessione: l'endpoint si protegge con un token nella
 * query string (env.VNNOX_CALLBACK_TOKEN). Se il token non è configurato, accetta
 * (utile in sviluppo) ma è consigliato impostarlo in produzione.
 *
 * Formato callback VNNOX (singolo o array):
 *   { playerId, command, logid, data: { ratio?, videoSource?, timeZone?, currentTime? } }
 *   command ∈ brightnessValue | volumeValue | videoSourceValue | timeValue
 * Stato salvato: KV `vnnox:status:{playerId}` = { brightness?, volume?, updatedAt }.
 */

interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}
interface Env {
  VEROLED_KV?: KV;
  VNNOX_CALLBACK_TOKEN?: string;
}

interface Callback {
  playerId?: string;
  command?: string;
  data?: { ratio?: number; videoSource?: number; timeZone?: string; currentTime?: string };
}

const TTL = 60 * 30; // 30 minuti

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const onRequestPost = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = ctx;

  // Verifica token (se configurato).
  const token = new URL(request.url).searchParams.get('token') || '';
  if (env.VNNOX_CALLBACK_TOKEN && token !== env.VNNOX_CALLBACK_TOKEN) {
    return json({ ok: false, error: 'token_non_valido' }, 401);
  }
  if (!env.VEROLED_KV) return json({ ok: false, error: 'kv_non_configurato' }, 503);

  let payload: unknown;
  try { payload = await request.json(); } catch { return json({ ok: false, error: 'body_non_valido' }, 400); }
  const items: Callback[] = Array.isArray(payload) ? payload : [payload as Callback];

  let saved = 0;
  for (const it of items) {
    if (!it || !it.playerId || !it.command) continue;
    const key = `vnnox:status:${it.playerId}`;
    let cur: { brightness?: number; volume?: number; updatedAt?: string } = {};
    try { const raw = await env.VEROLED_KV.get(key); if (raw) cur = JSON.parse(raw); } catch { /* ignora */ }
    if (it.command === 'brightnessValue' && typeof it.data?.ratio === 'number') cur.brightness = it.data.ratio;
    if (it.command === 'volumeValue' && typeof it.data?.ratio === 'number') cur.volume = it.data.ratio;
    cur.updatedAt = new Date().toISOString();
    await env.VEROLED_KV.put(key, JSON.stringify(cur), { expirationTtl: TTL });
    saved++;
  }
  return json({ ok: true, saved });
};

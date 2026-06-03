/**
 * POST /api/portale/control
 *   Body: { id, action, value? }   action ∈ 'brightness' | 'power' | 'reboot'
 *   → invia un comando a UNO degli schermi del cliente (luminosità/accensione/riavvio).
 *
 * Multi-tenant: l'azione è ammessa solo se `id` è tra gli schermi del cliente.
 * In modalità mock il comando viene accettato e restituito in eco.
 */

import { requireClient, type PortaleEnv } from '../_lib/portaleauth';
import { controlScreen, type ControlAction, type VnnoxEnv, VnnoxError } from '../_lib/vnnox';

type Env = PortaleEnv & VnnoxEnv;
const ACTIONS: ControlAction[] = ['brightness', 'power', 'reboot'];

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const onRequestPost = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = ctx;
  const client = await requireClient(env, request);
  if (!client) return json({ ok: false, error: 'non_autenticato' }, 401);

  let body: { id?: string; action?: string; value?: number | boolean };
  try { body = (await request.json()) as typeof body; } catch { return json({ ok: false, error: 'body_non_valido' }, 400); }

  const id = (body.id || '').trim();
  const action = (body.action || '') as ControlAction;
  if (!id || !ACTIONS.includes(action)) return json({ ok: false, error: 'parametri_non_validi' }, 400);
  if (!client.screens.includes(id)) return json({ ok: false, error: 'schermo_non_autorizzato' }, 403);

  if (action === 'brightness') {
    const v = Number(body.value);
    if (!Number.isFinite(v) || v < 0 || v > 100) return json({ ok: false, error: 'luminosita_non_valida' }, 400);
  }

  try {
    const result = await controlScreen(env, id, action, body.value);
    return json({ ok: true, result });
  } catch (e) {
    const err = e as VnnoxError;
    return json({ ok: false, error: 'vnnox_error', detail: err.message }, err.status || 502);
  }
};

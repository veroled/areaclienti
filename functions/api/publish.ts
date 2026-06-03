/**
 * POST /api/publish
 *   Body: { screens:[id], duration, ratio, bg, elements:[{type,x,y,w,h,src,md5,bytes,...}] }
 *   Pubblica la composizione del Compositore sugli schermi del cliente.
 *
 * Multi-tenant: solo sugli schermi del cliente autenticato.
 *  - mock → conferma (demo).
 *  - live → costruisce il program VNNOX (program/normal) e lo invia.
 *
 * Mapping verificato sulla doc per i media (PICTURE/GIF/VIDEO: url assoluto, md5, size,
 * duration ms, layout in %). Il widget TEXT è BEST-EFFORT (schema non pubblico) → da
 * confermare al primo test live con player reali.
 */

import { requireClient, type PortaleEnv } from '../_lib/portaleauth';
import { vnnoxMode, publishProgram, VnnoxError, type VnnoxEnv } from '../_lib/vnnox';

type Env = PortaleEnv & VnnoxEnv;

interface Element {
  type?: string; x?: number; y?: number; w?: number; h?: number;
  src?: string | null; md5?: string; bytes?: number;
  text?: string; size?: number; color?: string; weight?: number; align?: string;
}

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const pct = (v: number | undefined) => `${Math.round(v || 0)}%`;

function buildWidget(el: Element, i: number, origin: string, durMs: number): object | null {
  const layout = { x: pct(el.x), y: pct(el.y), width: pct(el.w), height: pct(el.h) };
  const zIndex = i + 1;
  if (el.type === 'image' || el.type === 'video') {
    if (!el.src) return null; // media locale non caricato → non pubblicabile
    const url = el.src.startsWith('/') ? origin + el.src : el.src;
    const type = el.type === 'video' ? 'VIDEO' : (/\.gif($|\?)/i.test(url) ? 'GIF' : 'PICTURE');
    return {
      type, zIndex, name: el.type, url,
      md5: (el.md5 || '').toLowerCase(), size: el.bytes || 0,
      duration: durMs, layout, inAnimation: { type: 'NONE', duration: 1000 },
    };
  }
  if (el.type === 'text') {
    // BEST-EFFORT: schema TEXT VNNOX non pubblico. fontSize stimato da cqw → px (≈ *6).
    return {
      type: 'TEXT', zIndex, duration: durMs, layout,
      text: el.text || '', textColor: el.color || '#ffffff',
      fontSize: Math.max(12, Math.round((el.size || 6) * 6)),
      fontStyle: (Number(el.weight) >= 700 ? 'BOLD' : 'NORMAL'),
      align: (el.align || 'center').toUpperCase(),
    };
  }
  return null;
}

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
  const elements = Array.isArray(body.elements) ? body.elements : [];
  if (!elements.length) return json({ ok: false, error: 'composizione_vuota' }, 400);

  const mode = vnnoxMode(env);
  if (mode === 'mock') {
    return json({ ok: true, mode, published: targets.length });
  }

  // LIVE — media locale non caricato su R2 (src nullo) non è pubblicabile.
  const localOnly = elements.some((e) => (e.type === 'image' || e.type === 'video') && !e.src);
  if (localOnly) return json({ ok: false, mode, error: 'media_locale_non_pubblicabile' }, 400);

  const origin = new URL(request.url).origin;
  const durMs = Math.max(1, body.duration || 10) * 1000;
  const widgets = elements.map((e, i) => buildWidget(e, i, origin, durMs)).filter(Boolean);
  if (!widgets.length) return json({ ok: false, mode, error: 'nessun_widget_valido' }, 400);

  const today = new Date().toISOString().slice(0, 10);
  const program = {
    playerIds: targets,
    schedule: {
      startDate: today,
      endDate: '2060-12-31',
      plans: [{ weekDays: [0, 1, 2, 3, 4, 5, 6], startTime: '00:00:00', endTime: '23:59:59' }],
    },
    pages: [{ name: 'Compositore VeroLED', widgets }],
  };

  try {
    const res = await publishProgram(env, program);
    const ok = (res.success || []).length;
    const failed = (res.fail || []).length;
    return json({ ok: ok > 0, mode, published: ok, failed });
  } catch (e) {
    const err = e as VnnoxError;
    return json({ ok: false, mode, error: 'vnnox_error', detail: err.message }, err.status || 502);
  }
};

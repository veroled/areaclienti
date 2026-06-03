/**
 * functions/_lib/vnnox.ts
 *
 * Client per la NovaStar VNNOX OpenAPI (NovaCloud Open Platform).
 * Due famiglie di API:
 *   • VNNOX Media → lista/stato player, controllo, pubblicazione contenuti, play log
 *                   (dispositivi: TU/TB/T — i nostri Taurus)
 *   • VNNOX Care  → monitoraggio stato device/schermi + allarmi
 *                   (dispositivi: MSD/MCTRL, V/VX, TU/TB/T)
 *
 * Autenticazione (lato SERVER, mai nel browser):
 *   Header su ogni richiesta: AppKey, Nonce, CurTime, CheckSum
 *   CheckSum = SHA256(AppSecret + Nonce + CurTime)
 *
 * Doc ufficiale : https://developer-en.vnnox.com
 * Nodo EU       : https://open-eu.vnnox.com   (altri: open-us / open-au / open-in)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MODALITÀ MOCK / LIVE
 *   • Finché non sono presenti VNNOX_APPKEY + VNNOX_APPSECRET (o se VNNOX_MODE=mock)
 *     il client restituisce dati FINTI deterministici, così il portale è
 *     sviluppabile e dimostrabile senza credenziali Novastar.
 *   • Quando arrivano le chiavi (NovaCloud Open Platform → enterprise auth) e si
 *     imposta VNNOX_MODE=live, le stesse funzioni colpiscono l'API reale.
 *
 * NB sui path: i path REST qui sotto (/v2/...) sono quelli noti dalla doc; vanno
 *    riconfermati 1:1 sul portale sviluppatori prima di attivare il LIVE. La
 *    forma dei dati restituiti è normalizzata dalle funzioni map*() in modo che
 *    il resto del portale non dipenda dal formato grezzo VNNOX.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface VnnoxEnv {
  VNNOX_APPKEY?: string;
  VNNOX_APPSECRET?: string;
  VNNOX_BASE?: string; // default https://open-eu.vnnox.com
  VNNOX_MODE?: string; // 'live' | 'mock'  (default: mock se mancano le chiavi)
}

/** Schermo normalizzato esposto al portale (indipendente dal formato VNNOX grezzo). */
export interface VnnoxScreen {
  id: string;
  name: string;
  online: boolean;
  model: string; // es. TB60, TB50, MCTRL4K
  resolution: string; // es. 1920x1080
  brightness: number; // 0-100 (%)
  power: boolean; // schermo acceso/spento
  temperature: number | null; // °C, null se non disponibile
  lastSeen: string; // ISO 8601
  location: string;
  alarms: VnnoxAlarm[];
}

export interface VnnoxAlarm {
  id: string;
  level: 'info' | 'warning' | 'critical';
  message: string;
  at: string; // ISO 8601
}

export type VnnoxMode = 'live' | 'mock';

export function vnnoxMode(env: VnnoxEnv): VnnoxMode {
  if ((env.VNNOX_MODE || '').toLowerCase() === 'mock') return 'mock';
  if ((env.VNNOX_MODE || '').toLowerCase() === 'live') return 'live';
  return env.VNNOX_APPKEY && env.VNNOX_APPSECRET ? 'live' : 'mock';
}

const DEFAULT_BASE = 'https://open-eu.vnnox.com';

// Endpoint VNNOX (path verificati su developer-en.vnnox.com · nodo EU open-eu.vnnox.com).
const EP = {
  onlineStatus: '/v2/player/current/online-status', // POST {playerIds} → [{playerId,sn,onlineStatus,lastOnlineTime}]
  runningStatus: '/v2/player/current/running-status', // POST {playerIds,commands,noticeUrl} → ASINCRONO (callback)
  screenStatus: '/v2/player/real-time-control/screen-status', // POST {playerIds,status:OPEN|CLOSE} → display on/off
  power: '/v2/player/real-time-control/power', // accensione fisica
  reboot: '/v2/player/real-time-control/reboot', // POST {playerIds}
  screenshot: '/v2/player/real-time-control/screen-capture', // POST {playerIds} → anteprima (uso futuro)
  brightness: '/v2/player/real-time-control/brightness', // POST {playerIds,ratio}  ⚠️ path da confermare sulla doc autenticata
  publish: '/v2/player/program/normal', // POST → pubblicazione contenuti (Solutions)
};

interface OnlineStatus {
  playerId: string;
  sn?: string;
  onlineStatus: number; // 0 = offline, 1 = online
  lastOnlineTime?: string;
}

// ── firma ────────────────────────────────────────────────────────────────────
function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
function nonce(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return toHex(a.buffer);
}

interface ReqOpts {
  method?: 'GET' | 'POST';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

/**
 * Chiamata firmata alla VNNOX OpenAPI. Usata SOLO in modalità live.
 * Ritorna il JSON grezzo (campo `data` se presente) o lancia VnnoxError.
 */
export async function vnnoxRequest<T = unknown>(env: VnnoxEnv, path: string, opts: ReqOpts = {}): Promise<T> {
  const base = (env.VNNOX_BASE || DEFAULT_BASE).replace(/\/$/, '');
  const url = new URL(base + path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
  }

  const curTime = Math.floor(Date.now() / 1000).toString();
  const non = nonce();
  const checkSum = await sha256Hex((env.VNNOX_APPSECRET || '') + non + curTime);

  const res = await fetch(url.toString(), {
    method: opts.method || 'GET',
    headers: {
      AppKey: env.VNNOX_APPKEY || '',
      Nonce: non,
      CurTime: curTime,
      CheckSum: checkSum,
      'Content-Type': 'application/json',
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  let json: any = null;
  try { json = await res.json(); } catch { /* risposta non-JSON */ }
  if (!res.ok) {
    throw new VnnoxError(`VNNOX ${res.status} su ${path}`, res.status, json);
  }
  // VNNOX incapsula tipicamente i dati in { code, msg, data }
  return (json && typeof json === 'object' && 'data' in json ? json.data : json) as T;
}

export class VnnoxError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status = 500, payload: unknown = null) {
    super(message);
    this.name = 'VnnoxError';
    this.status = status;
    this.payload = payload;
  }
}

// ── API di alto livello (le usa il portale) ───────────────────────────────────

/**
 * Elenco schermi con stato. In LIVE combina VNNOX Media (lista player) + Care
 * (stato/allarmi); per ora il ramo live è uno scheletro da completare quando
 * avremo i path esatti e le credenziali. `allowedIds` filtra il multi-tenant:
 * ogni cliente vede SOLO i propri schermi.
 */
/**
 * Valori che arrivano in modo ASINCRONO (callback running-status) e che il
 * chiamante (endpoint screens) legge dalla cache KV e passa qui per il merge.
 */
export interface ScreenStatusCache {
  [playerId: string]: { brightness?: number; volume?: number; temperature?: number };
}

export async function getScreens(env: VnnoxEnv, allowedIds?: string[], cache?: ScreenStatusCache): Promise<VnnoxScreen[]> {
  if (vnnoxMode(env) === 'mock') {
    let screens = mockScreens();
    if (allowedIds && allowedIds.length) {
      const set = new Set(allowedIds);
      screens = screens.filter((s) => set.has(s.id));
    }
    return screens;
  }

  // LIVE — multi-tenant: interroghiamo SOLO gli ID assegnati al cliente.
  if (!allowedIds || !allowedIds.length) return [];
  // Stato online/offline (sincrono, confermato).
  const online = await vnnoxRequest<OnlineStatus[]>(env, EP.onlineStatus, { method: 'POST', body: { playerIds: allowedIds } });
  const byId = new Map((online || []).map((o) => [o.playerId, o]));
  // TODO(live): nome/modello/risoluzione dall'endpoint Player List (Player Management);
  //   temperatura/allarmi da VNNOX Care. La luminosità arriva via callback (vedi cache).
  return allowedIds.map((id) => {
    const o = byId.get(id);
    const isOnline = !!o && o.onlineStatus === 1;
    const c = cache?.[id];
    return {
      id,
      name: id,
      online: isOnline,
      model: '—',
      resolution: '—',
      brightness: c?.brightness ?? 0,
      power: isOnline,
      temperature: c?.temperature ?? null,
      lastSeen: o?.lastOnlineTime || new Date(0).toISOString(),
      location: '',
      alarms: [],
    } satisfies VnnoxScreen;
  });
}

/**
 * Avvia la lettura ASINCRONA di luminosità/volume. VNNOX risponde via callback
 * sull'URL `noticeUrl` (vedi functions/api/portale/vnnox-callback.ts), che salva
 * i valori in KV; il prossimo refresh degli schermi li mostrerà.
 */
export async function requestRunningStatus(env: VnnoxEnv, playerIds: string[], noticeUrl: string): Promise<void> {
  if (vnnoxMode(env) === 'mock' || !playerIds.length) return;
  await vnnoxRequest(env, EP.runningStatus, {
    method: 'POST',
    body: { playerIds, commands: ['brightnessValue', 'volumeValue'], noticeUrl },
  });
}

export async function getScreen(env: VnnoxEnv, id: string, allowedIds?: string[]): Promise<VnnoxScreen | null> {
  const all = await getScreens(env, allowedIds);
  return all.find((s) => s.id === id) || null;
}

export type ControlAction = 'brightness' | 'power' | 'reboot';

/** Controllo schermo (luminosità / accensione / riavvio). Mock: eco dell'azione. */
export async function controlScreen(
  env: VnnoxEnv,
  id: string,
  action: ControlAction,
  value?: number | boolean,
): Promise<{ ok: boolean; id: string; action: ControlAction; value?: number | boolean }> {
  if (vnnoxMode(env) === 'mock') {
    return { ok: true, id, action, value };
  }
  // LIVE — VNNOX real-time control (path verificati su developer-en.vnnox.com).
  if (action === 'reboot') {
    await vnnoxRequest(env, EP.reboot, { method: 'POST', body: { playerIds: [id] } });
  } else if (action === 'power') {
    // value: true = accendi display (OPEN), false = spegni (CLOSE)
    await vnnoxRequest(env, EP.screenStatus, { method: 'POST', body: { playerIds: [id], status: value ? 'OPEN' : 'CLOSE' } });
  } else if (action === 'brightness') {
    // ⚠️ path/param del real-time brightness da confermare sulla doc autenticata
    await vnnoxRequest(env, EP.brightness, { method: 'POST', body: { playerIds: [id], ratio: value } });
  }
  return { ok: true, id, action, value };
}

// ── DATI MOCK (deterministici) ────────────────────────────────────────────────
function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export function mockScreens(): VnnoxScreen[] {
  return [
    {
      id: 'TB60-0001',
      name: 'Insegna Showroom — Milano',
      online: true,
      model: 'Taurus TB60',
      resolution: '1920×1080',
      brightness: 62,
      power: true,
      temperature: 41,
      lastSeen: ago(1),
      location: 'Milano, Via Roma 1',
      alarms: [],
    },
    {
      id: 'TB50-0042',
      name: 'Totem Ingresso — Sede',
      online: true,
      model: 'Taurus TB50',
      resolution: '1080×1920',
      brightness: 78,
      power: true,
      temperature: 47,
      lastSeen: ago(2),
      location: 'Bergamo, HQ',
      alarms: [
        { id: 'a1', level: 'warning', message: 'Temperatura ricevitore sopra soglia (47 °C)', at: ago(12) },
      ],
    },
    {
      id: 'MCTRL4K-0007',
      name: 'Maxischermo — Stadio',
      online: false,
      model: 'MCTRL4K',
      resolution: '3840×2160',
      brightness: 0,
      power: false,
      temperature: null,
      lastSeen: ago(640),
      location: 'Napoli, Stadio',
      alarms: [
        { id: 'a2', level: 'critical', message: 'Dispositivo offline da oltre 10 ore', at: ago(620) },
      ],
    },
  ];
}

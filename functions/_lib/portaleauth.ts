/**
 * functions/_lib/portaleauth.ts
 *
 * Autenticazione del PORTALE CLIENTI (areaclienti.veroledsrl.com).
 * Distinta dall'admin: qui entra il cliente finale per vedere/gestire i PROPRI
 * schermi VNNOX. Multi-tenant con chiave = P.IVA (stessa dell'anagrafica CRM).
 *
 * Storage KV (binding VEROLED_KV):
 *   portale:cliente:{piva} → PortaleClient (password hashata PBKDF2, screens assegnati)
 *
 * Sessione: token firmato HMAC-SHA256 in cookie HttpOnly `vl_portale`.
 *   payload = base64url({ piva, exp }) · firma = base64url(HMAC(secret, payload))
 *   secret  = env.PORTALE_SECRET || env.ADMIN_SECRET
 *
 * Riusa pbkdf2 / randHex da _lib/adminauth.ts (stesso schema dell'admin).
 */

import { pbkdf2, randHex } from './crypto';

export interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
}

export interface PortaleEnv {
  VEROLED_KV?: KVNamespace;
  ADMIN_SECRET?: string;
  PORTALE_SECRET?: string;
  VNNOX_MODE?: string; // se 'live' disattiva il login demo
}

/** Cliente del portale. `screens` = ID schermi VNNOX a lui assegnati (multi-tenant). */
export interface PortaleClient {
  piva: string;
  email: string;
  nome: string; // ragione sociale o referente
  salt: string;
  hash: string;
  screens: string[];
  createdAt: string;
  lastLogin?: string;
}

const SESSION_TTL = 60 * 60 * 12; // 12 ore
const KEEP_TTL = 60 * 60 * 24 * 365 * 10; // 10 anni
export const COOKIE = 'vl_portale';

// ── account DEMO integrato (solo in modalità mock; disattivato se VNNOX_MODE=live) ──
// Permette di provare il portale senza KV né provisioning. Mostra i 3 schermi mock.
const DEMO_PIVA = 'DEMO';
export const DEMO_LOGIN = { user: 'demo', password: 'veroled-demo' };
const DEMO_SCREENS = ['TB60-0001', 'TB50-0042', 'MCTRL4K-0007'];
function demoClient(): PortaleClient {
  return { piva: DEMO_PIVA, email: 'demo@veroled.it', nome: 'Cliente Demo', salt: '', hash: '', screens: DEMO_SCREENS.slice(), createdAt: new Date(0).toISOString() };
}
function demoEnabled(env: PortaleEnv): boolean {
  return (env.VNNOX_MODE || '').toLowerCase() !== 'live';
}
function isDemoLogin(env: PortaleEnv, identifier: string, password: string): boolean {
  return demoEnabled(env) && identifier.trim().toLowerCase() === DEMO_LOGIN.user && password === DEMO_LOGIN.password;
}

function normPiva(p: string): string {
  return String(p || '').replace(/\s/g, '').toUpperCase();
}
function eq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ── record cliente ─────────────────────────────────────────────────────────
export async function getClient(env: PortaleEnv, piva: string): Promise<PortaleClient | null> {
  if (normPiva(piva) === DEMO_PIVA && demoEnabled(env)) return demoClient();
  if (!env.VEROLED_KV) return null;
  const raw = await env.VEROLED_KV.get(`portale:cliente:${normPiva(piva)}`);
  return raw ? (JSON.parse(raw) as PortaleClient) : null;
}

export async function saveClient(env: PortaleEnv, rec: PortaleClient): Promise<void> {
  if (!env.VEROLED_KV) return;
  await env.VEROLED_KV.put(`portale:cliente:${normPiva(rec.piva)}`, JSON.stringify(rec), { expirationTtl: KEEP_TTL });
}

/** Crea/aggiorna un cliente del portale (lo userà l'admin per dare gli accessi). */
export async function upsertClient(
  env: PortaleEnv,
  input: { piva: string; email: string; nome: string; password?: string; screens?: string[] },
): Promise<{ ok: boolean; error?: string }> {
  const piva = normPiva(input.piva);
  if (!piva) return { ok: false, error: 'piva_mancante' };
  const existing = await getClient(env, piva);
  let salt = existing?.salt || '';
  let hash = existing?.hash || '';
  if (input.password) {
    if (input.password.length < 8) return { ok: false, error: 'password_corta' };
    salt = randHex(16);
    hash = await pbkdf2(input.password, salt);
  }
  if (!hash) return { ok: false, error: 'password_richiesta' };
  await saveClient(env, {
    piva,
    email: String(input.email || existing?.email || '').trim().toLowerCase(),
    nome: String(input.nome || existing?.nome || '').trim().slice(0, 120),
    salt,
    hash,
    screens: Array.isArray(input.screens) ? input.screens : existing?.screens || [],
    createdAt: existing?.createdAt || new Date().toISOString(),
    lastLogin: existing?.lastLogin,
  });
  return { ok: true };
}

/** Verifica credenziali. `identifier` = P.IVA oppure email. */
export async function verifyLogin(env: PortaleEnv, identifier: string, password: string): Promise<PortaleClient | null> {
  if (!identifier || !password) return null;
  if (isDemoLogin(env, identifier, password)) return demoClient();
  if (!env.VEROLED_KV) return null;
  const id = String(identifier).trim();
  let rec = await getClient(env, id); // prova come P.IVA
  if (!rec && id.includes('@')) {
    // fallback: cerca per email (scansione prefisso — il parco clienti è piccolo)
    const { keys } = await env.VEROLED_KV.list({ prefix: 'portale:cliente:' });
    for (const k of keys) {
      const raw = await env.VEROLED_KV.get(k.name);
      if (!raw) continue;
      const c = JSON.parse(raw) as PortaleClient;
      if (c.email && c.email.toLowerCase() === id.toLowerCase()) { rec = c; break; }
    }
  }
  if (!rec) return null;
  const calc = await pbkdf2(password, rec.salt);
  if (!eq(calc, rec.hash)) return null;
  rec.lastLogin = new Date().toISOString();
  await saveClient(env, rec);
  return rec;
}

// ── sessione firmata (HMAC) ──────────────────────────────────────────────────
function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlStr(str: string): string {
  return b64url(new TextEncoder().encode(str));
}
function fromB64url(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return b64url(sig);
}
function secretOf(env: PortaleEnv): string {
  return env.PORTALE_SECRET || env.ADMIN_SECRET || 'dev-only-insecure-secret';
}

export async function createSession(env: PortaleEnv, piva: string, ttl = SESSION_TTL): Promise<string> {
  const payload = b64urlStr(JSON.stringify({ piva: normPiva(piva), exp: Math.floor(Date.now() / 1000) + ttl }));
  const sig = await hmac(secretOf(env), payload);
  return `${payload}.${sig}`;
}

export async function readSession(env: PortaleEnv, token: string | null): Promise<{ piva: string } | null> {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = await hmac(secretOf(env), payload);
  if (!eq(expected, sig)) return null;
  try {
    const data = JSON.parse(fromB64url(payload)) as { piva?: string; exp?: number };
    if (!data.piva || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return { piva: data.piva };
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function sessionCookie(token: string, ttl = SESSION_TTL): string {
  return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${ttl}`;
}
export function clearCookie(): string {
  return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/** Cliente autenticato dalla richiesta, oppure null. */
export async function requireClient(env: PortaleEnv, request: Request): Promise<PortaleClient | null> {
  const sess = await readSession(env, readCookie(request, COOKIE));
  if (!sess) return null;
  return getClient(env, sess.piva);
}

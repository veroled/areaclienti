/**
 * functions/_lib/crypto.ts
 * Helper crypto per l'hashing password (PBKDF2-SHA256) e i salt.
 * Estratto, così il portale areaclienti è un progetto autonomo.
 */

const ITER = 100000;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function fromHex(hex: string): Uint8Array {
  const m = hex.match(/.{1,2}/g) || [];
  return Uint8Array.from(m.map((h) => parseInt(h, 16)));
}

export function randHex(n = 16): string {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return toHex(a.buffer);
}

export async function pbkdf2(password: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(saltHex), iterations: ITER, hash: 'SHA-256' } as Pbkdf2Params,
    key,
    256,
  );
  return toHex(bits);
}

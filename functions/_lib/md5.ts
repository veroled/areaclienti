/**
 * functions/_lib/md5.ts
 * MD5 (RFC 1321) su Uint8Array → hex minuscolo.
 * Serve perché i widget VNNOX (program/normal) richiedono l'md5 del media,
 * e WebCrypto non espone MD5.
 */

// 64 costanti: floor(abs(sin(i+1)) * 2^32)
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296));
const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

export function md5Hex(msg: Uint8Array): string {
  const n = msg.length;
  const total = (((n + 8) >> 6) + 1) << 6; // multiplo di 64 con spazio per 0x80 + lunghezza
  const bytes = new Uint8Array(total);
  bytes.set(msg);
  bytes[n] = 0x80;
  const dv = new DataView(bytes.buffer);
  dv.setUint32(total - 8, (n << 3) >>> 0, true);
  dv.setUint32(total - 4, Math.floor(n / 0x20000000) >>> 0, true);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const M = new Int32Array(16);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) | 0;
      A = D; D = C; C = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) | 0;
    }
    a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
  }
  const out = new Uint8Array(16);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, a0 >>> 0, true); odv.setUint32(4, b0 >>> 0, true);
  odv.setUint32(8, c0 >>> 0, true); odv.setUint32(12, d0 >>> 0, true);
  return Array.from(out).map((b) => b.toString(16).padStart(2, '0')).join('');
}

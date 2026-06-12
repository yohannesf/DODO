// UUIDv7 (RFC 9562): 48-bit unix-ms timestamp + random. Client-generated ids
// are the sync idempotency keys (spec §6.1), so client and server must share
// this implementation. Uses WebCrypto — works in browsers and Node ≥ 19.

const hex: string[] = [];
for (let i = 0; i < 256; i++) hex.push(i.toString(16).padStart(2, '0'));

export function uuidv7(now: number = Date.now()): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);

  // 48-bit big-endian timestamp
  b[0] = (now / 2 ** 40) & 0xff;
  b[1] = (now / 2 ** 32) & 0xff;
  b[2] = (now / 2 ** 24) & 0xff;
  b[3] = (now / 2 ** 16) & 0xff;
  b[4] = (now / 2 ** 8) & 0xff;
  b[5] = now & 0xff;

  b[6] = (b[6]! & 0x0f) | 0x70; // version 7
  b[8] = (b[8]! & 0x3f) | 0x80; // variant 10xx

  let s = '';
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 6 || i === 8 || i === 10) s += '-';
    s += hex[b[i]!];
  }
  return s;
}

/** Millisecond timestamp embedded in a UUIDv7. */
export function uuidv7Timestamp(id: string): number {
  const h = id.replaceAll('-', '').slice(0, 12);
  return parseInt(h, 16);
}

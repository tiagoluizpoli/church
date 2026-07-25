const UUID_BYTE_LENGTH = 16;
const UUID_VERSION_BYTE = 6;
const UUID_VARIANT_BYTE = 8;
const HEX_DASH_POSITIONS = new Set([4, 6, 8, 10]);

function hex(byte: number): string {
  return byte.toString(16).padStart(2, '0');
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  // `getRandomValues` is *not* gated on a secure context, unlike `randomUUID`.
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    return bytes;
  }
  // Last resort for an environment with no Web Crypto at all. These ids never
  // leave the client — they only tag rows the UI invented — so collision
  // resistance matters, unpredictability does not.
  for (let index = 0; index < length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/**
 * A v4 UUID that works off `localhost` over plain HTTP.
 *
 * `crypto.randomUUID()` exists only in a **secure context**, so on a LAN dev
 * host like `http://192.168.0.200:4001` — or any deployment not on HTTPS — it
 * is `undefined` and every call site throws "crypto.randomUUID is not a
 * function". Tests, jsdom and `localhost` are all secure contexts, which is
 * exactly why that never shows up before someone opens the app on another
 * machine.
 */
export function randomId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  const bytes = randomBytes(UUID_BYTE_LENGTH);
  // Version 4, RFC 4122 variant — the same shape `randomUUID` returns, so a
  // consumer cannot tell which branch produced the id.
  bytes[UUID_VERSION_BYTE] = (bytes[UUID_VERSION_BYTE] & 0x0f) | 0x40;
  bytes[UUID_VARIANT_BYTE] = (bytes[UUID_VARIANT_BYTE] & 0x3f) | 0x80;

  let id = '';
  for (const [index, byte] of bytes.entries()) {
    if (HEX_DASH_POSITIONS.has(index)) id += '-';
    id += hex(byte);
  }
  return id;
}

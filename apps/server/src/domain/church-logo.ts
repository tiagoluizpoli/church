import type { ChurchId } from './branded-ids';

/** Church logo rules (decision #977). */
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;
export const LOGO_MIN_LONGEST_SIDE = 128;
export const LOGO_MAX_LONGEST_SIDE = 512;
export const LOGO_MAX_ASPECT_RATIO = 4;
export const LOGO_CONTENT_TYPE = 'image/png';
export const LOGO_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export type LogoFormat = 'png' | 'jpeg' | 'webp';

interface BytesInput {
  bytes: Uint8Array;
}

interface HasSignatureInput extends BytesInput {
  offset: number;
  signature: string | number[];
}

function hasSignature({ bytes, offset, signature }: HasSignatureInput) {
  const expected =
    typeof signature === 'string'
      ? [...signature].map((char) => char.charCodeAt(0))
      : signature;
  return expected.every((byte, index) => bytes[offset + index] === byte);
}

/** The accepted format the bytes really are (magic bytes, never the name or declared type). */
export function detectLogoFormat({ bytes }: BytesInput): LogoFormat | null {
  if (
    hasSignature({
      bytes,
      offset: 0,
      signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    })
  ) {
    return 'png';
  }
  if (hasSignature({ bytes, offset: 0, signature: [0xff, 0xd8, 0xff] })) {
    return 'jpeg';
  }
  if (
    hasSignature({ bytes, offset: 0, signature: 'RIFF' }) &&
    hasSignature({ bytes, offset: 8, signature: 'WEBP' })
  ) {
    return 'webp';
  }
  return null;
}

interface DimensionsInput {
  width: number;
  height: number;
}

export type LogoDimensionRefusal = 'LOGO_TOO_SMALL' | 'LOGO_BAD_ASPECT_RATIO';

/** Longest side at least 128 px, ratio within 1:4–4:1. */
export function logoDimensionRefusal({
  width,
  height,
}: DimensionsInput): LogoDimensionRefusal | null {
  const longest = Math.max(width, height);
  if (longest < LOGO_MIN_LONGEST_SIDE) return 'LOGO_TOO_SMALL';
  if (longest > LOGO_MAX_ASPECT_RATIO * Math.min(width, height)) {
    return 'LOGO_BAD_ASPECT_RATIO';
  }
  return null;
}

interface ChurchLogoKeyInput {
  churchId: ChurchId;
}

/** Every logo key of the Church starts here. */
export function churchLogoPrefix({ churchId }: ChurchLogoKeyInput): string {
  return `public/churches/${churchId}/logo/`;
}

interface ChurchLogoKeyForInput extends ChurchLogoKeyInput {
  sha256: string;
}

/** Content-hashed, so a key is never overwritten with other bytes. */
export function churchLogoKey({
  churchId,
  sha256,
}: ChurchLogoKeyForInput): string {
  return `${churchLogoPrefix({ churchId })}${sha256}.png`;
}

interface IsChurchLogoKeyInput extends ChurchLogoKeyInput {
  key: string;
}

/** Whether `key` is one of this Church's logo keys (for *Desfazer*). */
export function isChurchLogoKey({ churchId, key }: IsChurchLogoKeyInput) {
  const prefix = churchLogoPrefix({ churchId });
  return (
    key.startsWith(prefix) &&
    /^[0-9a-f]{64}\.png$/.test(key.slice(prefix.length))
  );
}

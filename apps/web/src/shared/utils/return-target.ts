const MAX_DECODE_ATTEMPTS = 5;

export interface ValidateInternalReturnTargetInput {
  target: string | null | undefined;
}

function fullyDecode(value: string): string | null {
  let current = value;
  for (let attempt = 0; attempt < MAX_DECODE_ATTEMPTS; attempt += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      // Malformed percent-encoding: reject rather than guess.
      return null;
    }
    if (decoded === current) return decoded;
    current = decoded;
  }
  return current;
}

/**
 * Accepts only a same-origin, absolute-path deep-link target — the shape
 * TanStack Router's `to`/`href` expects. Everything else (external origins,
 * protocol-relative `//`, backslash tricks browsers normalize into `//`,
 * and percent-encoded variants of either) is rejected, including when the
 * trick only appears after decoding.
 */
export function validateInternalReturnTarget({
  target,
}: ValidateInternalReturnTargetInput): string | null {
  if (!target) return null;

  const decoded = fullyDecode(target);
  if (decoded === null) return null;

  if (decoded.includes('\\')) return null;
  if (!decoded.startsWith('/')) return null;
  if (decoded.startsWith('//')) return null;

  return target;
}

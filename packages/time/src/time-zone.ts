// Internal to the package: not re-exported from `index.ts`.
import { InvalidTimeValueError } from './brands';

export interface AssertTimeZoneInput {
  timeZone: string;
}

// An IANA name starts with a letter (`UTC`, `America/Sao_Paulo`, `Etc/GMT+3`).
// Screening the shape first matters: `Intl` also accepts fixed offsets such as
// `+05:30`, and date-fns-tz reads an empty zone as the process TZ.
const IANA_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

// `Intl.supportedValuesOf('timeZone')` is no allowlist: it omits aliases such as
// `Etc/UTC`, and which spelling it lists (`Asia/Kolkata` or `Asia/Calcutta`)
// varies by runtime. Constructing a formatter accepts any name the runtime
// knows, so remember the names that passed to keep repeat calls cheap.
const knownTimeZones = new Set<string>();

/** Throws unless `timeZone` is an IANA name the runtime knows. */
export function assertTimeZone({ timeZone }: AssertTimeZoneInput): void {
  if (knownTimeZones.has(timeZone)) return;
  if (!IANA_NAME_PATTERN.test(timeZone) || !isKnownToRuntime({ timeZone })) {
    throw new InvalidTimeValueError({ kind: 'TimeZone', value: timeZone });
  }
  knownTimeZones.add(timeZone);
}

function isKnownToRuntime({ timeZone }: AssertTimeZoneInput): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

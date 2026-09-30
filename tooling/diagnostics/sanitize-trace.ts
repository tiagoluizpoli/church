import { type Unzipped, unzipSync, zipSync } from 'fflate';
import {
  isSensitiveField,
  REDACTED,
  sanitize,
  secretPatterns,
} from './sanitize';

/**
 * Redaction for Playwright trace archives (ADR-0005). A trace records the
 * browser context's storage state, every request's cookies and headers, and
 * response bodies, so each text entry is scrubbed structurally (storage
 * state, cookie and local-storage values, authentication headers, and
 * sensitive-named fields) and every remaining string passes through
 * `sanitize`. The credential values found are then known secrets for the
 * whole archive, so a body echoing a cookie loses it too. Binary entries
 * (screenshots) are kept as they are.
 */

// Name/value pairs whose value is a credential whatever the name.
const NAME_VALUE_LISTS = new Set(['cookies', 'localStorage', 'sessionStorage']);
const AUTH_HEADER =
  /^(cookie|set-cookie|authorization|proxy-authorization|x-api-key|api-key)$/i;
// Their credential is the last word: `Bearer <token>`, `<key>`. Cookie
// values come from the cookie lists instead of parsing these headers.
const CREDENTIAL_HEADER =
  /^(authorization|proxy-authorization|x-api-key|api-key)$/i;
const STORAGE_STATE_KEY = 'storageState';

interface CollectInput {
  value: unknown;
  credentials: Set<string>;
  inCredentialList: boolean;
}

/** Gathers every cookie, storage, and authentication-header value. */
function collectCredentials(input: CollectInput): void {
  const { value, credentials } = input;

  if (Array.isArray(value)) {
    for (const item of value) {
      collectCredentials({
        value: item,
        credentials,
        inCredentialList: input.inCredentialList,
      });
    }
    return;
  }
  if (value === null || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  if (typeof record.value === 'string') {
    if (input.inCredentialList) credentials.add(record.value);
    if (
      typeof record.name === 'string' &&
      CREDENTIAL_HEADER.test(record.name)
    ) {
      credentials.add(record.value.trim().split(/\s+/).at(-1) ?? '');
    }
  }
  for (const [key, child] of Object.entries(record)) {
    collectCredentials({
      value: child,
      credentials,
      inCredentialList: NAME_VALUE_LISTS.has(key),
    });
  }
}

interface ScrubInput {
  value: unknown;
  secrets: RegExp[];
  /** Inside a cookie or storage list: every `value` is a credential. */
  inCredentialList: boolean;
}

function scrub(input: ScrubInput): unknown {
  const { value, secrets } = input;

  if (typeof value === 'string') return sanitize({ text: value, secrets });
  if (Array.isArray(value)) {
    return value.map((item) =>
      scrub({ value: item, secrets, inCredentialList: input.inCredentialList }),
    );
  }
  if (value === null || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  const valueIsCredential =
    input.inCredentialList ||
    (typeof record.name === 'string' && AUTH_HEADER.test(record.name));

  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => {
      if (
        key === STORAGE_STATE_KEY ||
        (key === 'value' && valueIsCredential) ||
        (typeof child === 'string' && isSensitiveField({ name: key }))
      ) {
        return [key, REDACTED];
      }
      return [
        key,
        scrub({
          value: child,
          secrets,
          inCredentialList: NAME_VALUE_LISTS.has(key),
        }),
      ];
    }),
  );
}

interface TextInput {
  text: string;
}

/** A parsed JSON value, or the raw text when it is not JSON. */
type EntryLine = { json: unknown } | { raw: string };

function parseEntryLine(input: TextInput): EntryLine {
  try {
    return { json: JSON.parse(input.text) };
  } catch {
    return { raw: input.text };
  }
}

/** A JSON document; else JSON lines (`trace.trace`, `trace.network`), each
 * line a document of its own; else plain text lines. */
function parseEntry(input: TextInput): EntryLine[] {
  const whole = parseEntryLine(input);
  if ('json' in whole) return [whole];
  return input.text.split('\n').map((text) => parseEntryLine({ text }));
}

interface WriteDocumentsInput {
  documents: EntryLine[];
  secrets: RegExp[];
}

function writeDocuments(input: WriteDocumentsInput): string {
  return input.documents
    .map((document) =>
      'json' in document
        ? JSON.stringify(
            scrub({
              value: document.json,
              secrets: input.secrets,
              inCredentialList: false,
            }),
          )
        : sanitize({ text: document.raw, secrets: input.secrets }),
    )
    .join('\n');
}

export interface SanitizeTraceInput {
  zip: Uint8Array;
  secrets: RegExp[];
}

/** Returns the archive with every text entry sanitized. */
export function sanitizeTrace(input: SanitizeTraceInput): Uint8Array {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const encoder = new TextEncoder();
  const entries: Unzipped = {};
  const textEntries = new Map<string, EntryLine[]>();
  const credentials = new Set<string>();

  for (const [name, content] of Object.entries(unzipSync(input.zip))) {
    let text: string;
    try {
      text = decoder.decode(content);
    } catch {
      entries[name] = content;
      continue;
    }
    const documents = parseEntry({ text });
    textEntries.set(name, documents);
    for (const document of documents) {
      if ('json' in document) {
        collectCredentials({
          value: document.json,
          credentials,
          inCredentialList: false,
        });
      }
    }
  }

  const secrets = [
    ...secretPatterns({ values: credentials }),
    ...input.secrets,
  ];
  for (const [name, documents] of textEntries) {
    entries[name] = encoder.encode(writeDocuments({ documents, secrets }));
  }

  return zipSync(entries);
}

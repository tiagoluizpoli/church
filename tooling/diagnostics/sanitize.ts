import { existsSync, readFileSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';
import { type CwdInput, valueFilePaths } from '../worktree/local-env';

/**
 * Redaction for failure-bundle text (ADR-0005): output and command lines
 * lose known secrets, URL credentials, query strings and fragments, cookie
 * and authorization values, secret-named assignments, JSON fields and
 * flags, JWTs, private keys, emails, and invitation identifiers, while
 * stack traces, hosts, ports, paths, and database names stay readable.
 */

export const REDACTED = '[redacted]';

// Value-file keys whose values are never written, wherever they appear.
const SENSITIVE_KEY =
  /SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|CREDENTIAL|COOKIE|DATABASE_URL/i;
// Shorter values ("true", a port) would redact ordinary words and numbers.
const MIN_SECRET_LENGTH = 6;
const SENSITIVE_WORD =
  'secret|token|password|passwd|api[_-]?key|private[_-]?key|credential';

const PRIVATE_KEY_BLOCK =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;
// scheme://[userinfo@]host[:port][/path][?query][#fragment]. The userinfo
// runs to the token's last `@`, so a password containing `@` or `/` is
// removed whole.
const URL_PATTERN =
  /\b([a-z][a-z0-9+.-]*:\/\/)(?:[^\s'"<>`]*@)?([^\s/?#'"<>`@]*)([^\s?#'"<>`]*)(?:[?#][^\s'"<>`]*)?/gi;
const HEADER_PATTERN =
  /\b(set-cookie|cookie|authorization|x-api-key|api-key)(\s*[:=]\s*)[^\n]*/gi;
const AUTH_SCHEME_PATTERN = /\b(bearer|basic)\s+[a-z0-9._~+/=-]+/gi;
const JWT_PATTERN = /\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+/gi;
const SENSITIVE_FIELD = new RegExp(
  `${SENSITIVE_WORD}|cookie|authorization`,
  'i',
);
const JSON_FIELD = new RegExp(
  `("[^"\\n]*(?:${SENSITIVE_WORD}|cookie|authorization)[^"\\n]*"\\s*:\\s*)("(?:[^"\\\\\\n]|\\\\.)*"|[^\\s,}\\]]+)`,
  'gi',
);
const FLAG = new RegExp(
  `(--?[a-z0-9-]*(?:${SENSITIVE_WORD})[a-z0-9-]*)(=|\\s+)(?!-)("[^"\\n]*"|'[^'\\n]*'|\\S+)`,
  'gi',
);
const ASSIGNMENT = new RegExp(
  `\\b([a-z0-9_]*(?:${SENSITIVE_WORD})[a-z0-9_]*)(\\s*[=:]\\s*)("[^"\\n]*"|'[^'\\n]*'|[^\\s,;]+)`,
  'gi',
);
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// EMAIL_PATTERN tried from every position of a long local-part run (an
// inline base64 source map) rescans the run each time: quadratic. Every
// position of one run reaches the same `@`, so a run either matches from
// its start or not at all; addresses glued to the end of a previous one,
// which the unanchored search tried right there, repeat the group.
const EMAIL_RUN_PATTERN =
  /(?<![a-z0-9._%+-])(?:[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})+/gi;
// A UUID right after an `invitation…` word: `/invitations/ministry/<id>`,
// `"invitationId":"<id>"` (also JSON-escaped), `Invitation: <id>`. Other
// identifiers (users, Churches) stay readable.
const INVITATION_ID_PATTERN =
  /(invitation[a-z0-9_-]*[\\"']*\s*[:=/]?\s*[\\"']*(?:[a-z-]+\/)?)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

interface ContentInput {
  content: string;
}

function unquoted(input: ContentInput): string {
  return input.content.replace(/^(['"])(.*)\1$/, '$2');
}

function escapeRegExp(input: ContentInput): string {
  return input.content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface KnownSecretsInput {
  cwd: string;
  /** Searched too: in CI, secrets arrive only through the job environment. */
  env: NodeJS.ProcessEnv;
}

interface EntryInput {
  key: string;
  value: string;
}

/** `KEY=value` lines of every value file the worktree's commands may read;
 * none outside a repository. */
function valueFileEntries(input: CwdInput): EntryInput[] {
  let paths: string[];
  try {
    paths = valueFilePaths(input);
  } catch {
    return [];
  }

  const entries: EntryInput[] = [];
  for (const path of paths) {
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const separator = line.indexOf('=');
      if (separator <= 0 || line.startsWith('#')) continue;
      entries.push({
        key: line.slice(0, separator),
        value: unquoted({ content: line.slice(separator + 1).trim() }),
      });
    }
  }
  return entries;
}

/**
 * Sensitive values from every value file the worktree's commands may read
 * and from the process environment, as whole-token patterns: a password such
 * as `postgres` must not mangle `postgresql` or a `postgres://` scheme. They
 * are only matched against, never written.
 */
export function knownSecretsOf(input: KnownSecretsInput): RegExp[] {
  const entries = [
    ...valueFileEntries({ cwd: input.cwd }),
    ...Object.entries(input.env).map(([key, value]) => ({
      key,
      value: value ?? '',
    })),
  ];
  return secretPatterns({
    values: entries
      .filter(({ key }) => SENSITIVE_KEY.test(key))
      .map(({ value }) => value),
  });
}

export interface SecretValuesInput {
  values: Iterable<string>;
}

/** Whole-token patterns for known secret values, longest first so a secret
 * containing another is replaced whole. Values too short to tell from
 * ordinary words are skipped. */
export function secretPatterns(input: SecretValuesInput): RegExp[] {
  return [...new Set(input.values)]
    .filter((secret) => secret.length >= MIN_SECRET_LENGTH)
    .sort((a, b) => b.length - a.length)
    .map(
      (secret) =>
        new RegExp(
          `(?<![A-Za-z0-9])${escapeRegExp({ content: secret })}(?![A-Za-z0-9]|://)`,
          'g',
        ),
    );
}

export interface FieldNameInput {
  name: string;
}

/** Whether a structured field's value is a secret by its name alone, as
 * the JSON-field pass decides for text. */
export function isSensitiveField(input: FieldNameInput): boolean {
  return SENSITIVE_FIELD.test(input.name);
}

export interface SanitizeInput {
  text: string;
  secrets: RegExp[];
}

export function sanitize(input: SanitizeInput): string {
  // URLs first: their credentials go whole before any known value can break
  // the URL apart.
  let text = stripVTControlCharacters(input.text)
    .replace(PRIVATE_KEY_BLOCK, `${REDACTED} private key`)
    .replace(URL_PATTERN, '$1$2$3');
  for (const secret of input.secrets) {
    text = text.replace(secret, REDACTED);
  }

  return text
    .replace(HEADER_PATTERN, `$1$2${REDACTED}`)
    .replace(AUTH_SCHEME_PATTERN, `$1 ${REDACTED}`)
    .replace(JWT_PATTERN, REDACTED)
    .replace(JSON_FIELD, `$1"${REDACTED}"`)
    .replace(FLAG, `$1$2${REDACTED}`)
    .replace(ASSIGNMENT, `$1$2${REDACTED}`)
    .replace(EMAIL_RUN_PATTERN, (emails) =>
      emails.replace(EMAIL_PATTERN, '[email]'),
    )
    .replace(INVITATION_ID_PATTERN, '$1[invitation]');
}

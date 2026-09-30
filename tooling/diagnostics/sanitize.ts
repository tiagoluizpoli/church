import { existsSync, readFileSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';
import { type CwdInput, valueFilePaths } from '../worktree/local-env';

/**
 * Redaction for failure-bundle text (ADR-0005): output and command lines
 * lose known secrets, URL credentials, query strings and fragments, cookie
 * and authorization values, secret-named assignments, JSON fields and
 * flags, JWTs, private keys, and emails, while stack traces, hosts, ports,
 * paths, and database names stay readable.
 */

const REDACTED = '[redacted]';

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

interface ContentInput {
  content: string;
}

function unquoted(input: ContentInput): string {
  return input.content.replace(/^(['"])(.*)\1$/, '$2');
}

function escapeRegExp(input: ContentInput): string {
  return input.content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sensitive values from every value file the worktree's commands may read,
 * as whole-token patterns: a password such as `postgres` must not mangle
 * `postgresql` or a `postgres://` scheme. They are only matched against,
 * never written.
 */
export function knownSecretsOf(input: CwdInput): RegExp[] {
  let paths: string[];
  try {
    paths = valueFilePaths(input);
  } catch {
    return [];
  }

  const secrets = new Set<string>();
  for (const path of paths) {
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const separator = line.indexOf('=');
      if (separator <= 0 || line.startsWith('#')) continue;
      const value = unquoted({ content: line.slice(separator + 1).trim() });
      if (
        SENSITIVE_KEY.test(line.slice(0, separator)) &&
        value.length >= MIN_SECRET_LENGTH
      ) {
        secrets.add(value);
      }
    }
  }

  // Longest first, so a secret containing another is replaced whole.
  return [...secrets]
    .sort((a, b) => b.length - a.length)
    .map(
      (secret) =>
        new RegExp(
          `(?<![A-Za-z0-9])${escapeRegExp({ content: secret })}(?![A-Za-z0-9]|://)`,
          'g',
        ),
    );
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
    .replace(EMAIL_PATTERN, '[email]');
}

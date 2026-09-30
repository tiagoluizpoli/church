import { describe, expect, it } from 'bun:test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { sanitizeTrace } from '../../diagnostics/sanitize-trace';

/**
 * Feeds a Playwright-shaped trace archive through the sanitizer and inspects
 * every entry of the archive it returns.
 */

const STORAGE_COOKIE = 'storage-state-session-4b1d';
const LOCAL_STORAGE = 'local-storage-value-9c2e';
const SET_COOKIE = 'set-cookie-session-71af';
const BEARER = 'bearer-credential-5e0a';
const BODY_TOKEN = 'body-session-token-3d8f';
const KNOWN_SECRET = 'known-auth-secret-value-02';
const EMAIL = 'volunteer@church.example';
const INVITATION_ID = '8b0e7f0c-5d3a-4c61-9b7e-2f1a6c9d4e13';
const SECRETS = [
  STORAGE_COOKIE,
  LOCAL_STORAGE,
  SET_COOKIE,
  BEARER,
  BODY_TOKEN,
  KNOWN_SECRET,
  EMAIL,
  INVITATION_ID,
];
const SCREENSHOT = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x80, 0xfe]);

const responseBody = JSON.stringify({
  token: BODY_TOKEN,
  user: { email: EMAIL, name: 'Volunteer' },
  seen: `better-auth.session_token=${STORAGE_COOKIE}`,
  // A cookie whose name looks harmless, echoed where no field name marks it.
  echoed: `sess=${SET_COOKIE} theme=${LOCAL_STORAGE}`,
});

const traceLines = [
  {
    type: 'context-options',
    options: {
      storageState: {
        cookies: [{ name: 'better-auth.session_token', value: STORAGE_COOKIE }],
        origins: [
          {
            origin: 'http://localhost:4101',
            localStorage: [{ name: 'k', value: LOCAL_STORAGE }],
          },
        ],
      },
      locale: 'pt-BR',
    },
  },
  {
    type: 'after',
    callId: 'call@12',
    result: { body: responseBody },
    error: { message: `Invitation: ${INVITATION_ID} used ${KNOWN_SECRET}` },
  },
];

const networkLines = [
  {
    type: 'resource-snapshot',
    snapshot: {
      request: {
        method: 'GET',
        url: 'http://localhost:4100/api/auth/get-session',
        cookies: [{ name: 'better-auth.session_token', value: STORAGE_COOKIE }],
        headers: [
          { name: 'Accept', value: 'application/json' },
          {
            name: 'Cookie',
            value: `better-auth.session_token=${STORAGE_COOKIE}`,
          },
          { name: 'authorization', value: `Bearer ${BEARER}` },
        ],
      },
      response: {
        status: 200,
        cookies: [{ name: 'sess', value: SET_COOKIE, path: '/' }],
        headers: [{ name: 'set-cookie', value: `sess=${SET_COOKIE}; Path=/` }],
      },
    },
  },
];

function jsonLines(lines: unknown[]): Uint8Array {
  return strToU8(`${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
}

function sanitizedEntries(): Record<string, Uint8Array> {
  const zip = zipSync({
    'trace.trace': jsonLines(traceLines),
    'trace.network': jsonLines(networkLines),
    'resources/4f2c.json': strToU8(responseBody),
    'resources/page@1.jpeg': SCREENSHOT,
  });

  return unzipSync(
    sanitizeTrace({
      zip,
      secrets: [new RegExp(KNOWN_SECRET, 'g')],
    }),
  );
}

describe('sanitizeTrace', () => {
  it('removes browser authentication state, credentials, emails, and invitation identifiers from every text entry', () => {
    const entries = sanitizedEntries();

    for (const [name, content] of Object.entries(entries)) {
      if (name.endsWith('.jpeg')) continue;
      const text = strFromU8(content);
      for (const secret of SECRETS) {
        expect(text, `${name} leaks ${secret}`).not.toContain(secret);
      }
    }
  });

  it('keeps the trace readable: entries, JSON lines, requests, and screenshots survive', () => {
    const entries = sanitizedEntries();

    expect(Object.keys(entries).sort()).toEqual([
      'resources/4f2c.json',
      'resources/page@1.jpeg',
      'trace.network',
      'trace.trace',
    ]);
    expect(entries['resources/page@1.jpeg']).toEqual(SCREENSHOT);

    const network = strFromU8(entries['trace.network'] ?? new Uint8Array())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(network[0].snapshot.request.url).toBe(
      'http://localhost:4100/api/auth/get-session',
    );
    expect(network[0].snapshot.request.headers[0]).toEqual({
      name: 'Accept',
      value: 'application/json',
    });
    expect(network[0].snapshot.response.status).toBe(200);

    const trace = strFromU8(entries['trace.trace'] ?? new Uint8Array())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(trace[0].options.locale).toBe('pt-BR');
    expect(trace[1].callId).toBe('call@12');
  });
});

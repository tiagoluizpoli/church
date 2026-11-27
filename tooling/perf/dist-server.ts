import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { type IncomingHttpHeaders, request } from 'node:http';
import {
  createSecureServer,
  type Http2SecureServer,
  type Http2ServerRequest,
  type Http2ServerResponse,
} from 'node:http2';
import { tmpdir } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { gzipSync, zstdCompressSync } from 'node:zlib';

/**
 * The deployment's page origin, as far as loading `/login` needs it: HTTP/2
 * over TLS (a self-signed certificate here), the Caddyfile's `encode zstd
 * gzip`, cache headers and SPA fallback to `index.html`, and `/api/*` proxied
 * to the API.
 */

export interface DistServerInput {
  distDirectory: string;
  apiPort: number;
  port: number;
}

interface RespondInput {
  incoming: Http2ServerRequest;
  outgoing: Http2ServerResponse;
}

interface ProxyInput extends RespondInput {
  apiPort: number;
}

interface FileInput extends RespondInput {
  distDirectory: string;
}

interface Certificate {
  key: Buffer;
  cert: Buffer;
}

interface Encoding {
  name: string;
  compress: (body: Buffer) => Buffer;
}

const GZIP_LEVEL = 5;
// In Caddy's order of preference.
const ENCODINGS: Encoding[] = [
  { name: 'zstd', compress: (body) => zstdCompressSync(body) },
  { name: 'gzip', compress: (body) => gzipSync(body, { level: GZIP_LEVEL }) },
];
// Caddy leaves smaller bodies alone.
const MIN_COMPRESSED_BYTES = 512;
const COMPRESSIBLE_TYPE = /^(text\/|image\/svg|application\/(json|manifest))/;
const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};
const BAD_GATEWAY = 502;
const NOT_FOUND = 404;
// HTTP/1.1 connection headers, which HTTP/2 refuses.
const CONNECTION_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
]);

interface HeadersInput {
  headers: IncomingHttpHeaders;
}

/** Without HTTP/2's pseudo-headers and HTTP/1.1's connection headers. */
function portableHeaders(input: HeadersInput): IncomingHttpHeaders {
  const entries = Object.entries(input.headers).filter(
    ([name]) => !name.startsWith(':') && !CONNECTION_HEADERS.has(name),
  );
  return Object.fromEntries(entries);
}

function selfSignedCertificate(): Certificate {
  const directory = mkdtempSync(join(tmpdir(), 'church-perf-tls-'));
  const keyPath = join(directory, 'key.pem');
  const certPath = join(directory, 'cert.pem');
  const args = 'req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost';
  try {
    execFileSync(
      'openssl',
      [...args.split(' '), '-keyout', keyPath, '-out', certPath],
      { stdio: 'ignore' },
    );
    return { key: readFileSync(keyPath), cert: readFileSync(certPath) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function proxyToApi(input: ProxyInput): void {
  const { incoming, outgoing, apiPort } = input;
  const { url, method, authority } = incoming;
  const headers = {
    ...portableHeaders({ headers: incoming.headers }),
    host: authority,
  };
  const upstream = request(
    { host: 'localhost', port: apiPort, path: url, method, headers },
    (response) => {
      const responseHeaders = portableHeaders({ headers: response.headers });
      outgoing.writeHead(response.statusCode ?? BAD_GATEWAY, responseHeaders);
      response.pipe(outgoing);
    },
  );
  upstream.on('error', () => {
    outgoing.writeHead(BAD_GATEWAY);
    outgoing.end();
  });
  incoming.pipe(upstream);
}

function serveFile(input: FileInput): void {
  const { incoming, outgoing, distDirectory } = input;
  const [path = '/'] = (incoming.url ?? '/').split('?');
  const requested = join(distDirectory, normalize(decodeURIComponent(path)));
  const isHit =
    requested.startsWith(`${distDirectory}${sep}`) &&
    existsSync(requested) &&
    statSync(requested).isFile();
  const isAsset = path.startsWith('/assets/');
  // Only app routes fall back to the SPA; a missing asset is a 404.
  if (!isHit && isAsset) {
    outgoing.writeHead(NOT_FOUND);
    outgoing.end();
    return;
  }
  const file = isHit ? requested : join(distDirectory, 'index.html');
  const type = CONTENT_TYPES[extname(file)] ?? 'application/octet-stream';
  const body = readFileSync(file);

  const cacheControl = isAsset
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
  const accepted = String(incoming.headers['accept-encoding'] ?? '');
  const isCompressible =
    COMPRESSIBLE_TYPE.test(type) && body.length >= MIN_COMPRESSED_BYTES;
  const encoding = isCompressible
    ? ENCODINGS.find(({ name }) => accepted.includes(name))
    : undefined;

  outgoing.setHeader('Content-Type', type);
  outgoing.setHeader('Cache-Control', cacheControl);
  if (encoding) outgoing.setHeader('Content-Encoding', encoding.name);
  const payload = encoding ? encoding.compress(body) : body;
  outgoing.end(payload);
}

/** Listens on every interface: the dev hostname may resolve to any of them. */
export async function startDistServer(
  input: DistServerInput,
): Promise<Http2SecureServer> {
  const { distDirectory, apiPort, port } = input;
  const certificate = selfSignedCertificate();
  const server = createSecureServer(certificate, (incoming, outgoing) => {
    if (incoming.url?.startsWith('/api/')) {
      proxyToApi({ incoming, outgoing, apiPort });
      return;
    }
    serveFile({ incoming, outgoing, distDirectory });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, resolve);
  });

  return server;
}

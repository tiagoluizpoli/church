import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { addMilliseconds, now, setTestClock } from '@church/time';
import { afterEach, describe, expect, it } from 'vitest';
import {
  HttpWebShell,
  INDEX_CACHE_TTL_MS,
} from '@/infrastructure/services/http-web-shell';

const SHORT_TIMEOUT_MS = 50;

interface FakeWeb {
  server: Server;
  url: string;
  hits: () => number;
}

interface StartWebInput {
  /** Never answers when true, like a hung web container. */
  hang?: boolean;
}

const servers: Server[] = [];

async function startWeb({ hang = false }: StartWebInput): Promise<FakeWeb> {
  let hits = 0;
  const server = createServer((_request, response) => {
    hits += 1;
    if (!hang) response.end(`<html>${hits}</html>`);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}`, hits: () => hits };
}

afterEach(() => {
  for (const server of servers.splice(0)) server.closeAllConnections();
});

describe('HttpWebShell', () => {
  it('reads index.html once and serves it from memory until it ages out', async () => {
    const start = now();
    setTestClock({ instant: start });
    const web = await startWeb({});
    const shell = new HttpWebShell({
      publicOrigin: 'https://church.test',
      internalUrl: web.url,
    });

    expect(await shell.readIndexHtml()).toBe('<html>1</html>');
    expect(await shell.readIndexHtml()).toBe('<html>1</html>');
    expect(web.hits()).toBe(1);

    const aged = addMilliseconds({
      instant: start,
      milliseconds: INDEX_CACHE_TTL_MS + 1,
    });
    setTestClock({ instant: aged });

    expect(await shell.readIndexHtml()).toBe('<html>2</html>');
  });

  it('gives up on a web container that never answers', async () => {
    const web = await startWeb({ hang: true });
    const shell = new HttpWebShell({
      publicOrigin: 'https://church.test',
      internalUrl: web.url,
      timeoutMs: SHORT_TIMEOUT_MS,
    });

    await expect(shell.readIndexHtml()).rejects.toThrow();
  });
});

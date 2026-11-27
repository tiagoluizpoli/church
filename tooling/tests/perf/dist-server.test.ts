import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:http2';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { startDistServer } from '../../perf/dist-server';

const distDirectory = mkdtempSync(join(tmpdir(), 'church-dist-server-'));
let server: Awaited<ReturnType<typeof startDistServer>>;
let origin: string;

function statusOf(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const client = connect(origin, { rejectUnauthorized: false });
    client.on('error', reject);
    const request = client.request({ ':path': path });
    request.on('response', (headers) => {
      resolve(Number(headers[':status']));
      client.close();
    });
    request.on('error', reject);
    request.end();
  });
}

beforeAll(async () => {
  mkdirSync(join(distDirectory, 'assets'));
  writeFileSync(join(distDirectory, 'index.html'), '<!doctype html>');
  server = await startDistServer({ distDirectory, apiPort: 1, port: 0 });
  origin = `https://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
  rmSync(distDirectory, { recursive: true, force: true });
});

describe('perf dist server', () => {
  test('answers 400 to a badly encoded path and keeps serving', async () => {
    expect(await statusOf('/%E0%A4%A')).toBe(400);
    expect(await statusOf('/login')).toBe(200);
  });

  test('never serves a file outside the dist folder', async () => {
    expect(await statusOf('/assets/%2e%2e/%2e%2e/etc/passwd')).toBe(404);
  });
});

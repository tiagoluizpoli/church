import { randomUUID } from 'node:crypto';
import { env } from '@church/env/server';
import { describe, expect, it } from 'vitest';
import { S3ObjectStorage } from '@/infrastructure/storage/s3-object-storage';

/**
 * Object-storage adapter contract against the local RustFS (#1014): the
 * worktree bucket `db:bootstrap` created, with anonymous read on `public/*`.
 */
const storage = new S3ObjectStorage({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  bucket: env.S3_BUCKET,
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  publicUrl: env.STORAGE_PUBLIC_URL,
});

const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const cacheControl = 'public, max-age=31536000, immutable';

function uniqueKey(prefix: string): string {
  return `${prefix}/object-storage-contract/${randomUUID()}.png`;
}

describe('S3 object storage', () => {
  it('serves a public/ object anonymously with its content type and cache control', async () => {
    const key = uniqueKey('public');
    await storage.put({
      key,
      body: bytes,
      contentType: 'image/png',
      cacheControl,
    });

    const response = await fetch(storage.publicUrl({ key }));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe(cacheControl);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    await storage.delete({ key });
  });

  it('refuses an object outside public/ to an anonymous reader', async () => {
    const key = uniqueKey('private');
    await storage.put({
      key,
      body: bytes,
      contentType: 'image/png',
      cacheControl,
    });

    const response = await fetch(storage.publicUrl({ key }));

    expect(response.status).toBe(403);
    await storage.delete({ key });
  });

  it('deletes an object so it is no longer served', async () => {
    const key = uniqueKey('public');
    await storage.put({
      key,
      body: bytes,
      contentType: 'image/png',
      cacheControl,
    });

    await storage.delete({ key });

    expect((await fetch(storage.publicUrl({ key }))).status).toBe(404);
  });

  it('tells whether an object is stored', async () => {
    const key = uniqueKey('public');
    await storage.put({
      key,
      body: bytes,
      contentType: 'image/png',
      cacheControl,
    });

    expect(await storage.exists({ key })).toBe(true);
    await storage.delete({ key });
    expect(await storage.exists({ key })).toBe(false);
  });

  it('builds the public URL from the configured base and the key', () => {
    const configured = new S3ObjectStorage({
      endpoint: 'http://127.0.0.1:9000',
      region: 'us-east-1',
      bucket: 'church-production',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      publicUrl: 'https://storage.lunalabs.com.br/church-production/',
    });

    expect(
      configured.publicUrl({ key: 'public/churches/c1/logo/abc.png' }),
    ).toBe(
      'https://storage.lunalabs.com.br/church-production/public/churches/c1/logo/abc.png',
    );
  });
});

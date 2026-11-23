import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { s3Bucket } from '@/infrastructure/storage/s3-bucket-admin';

const BUCKET = 'church-test';

const bucket = s3Bucket({
  endpoint: 'http://storage.test:9000',
  region: 'us-east-1',
  bucket: BUCKET,
  accessKeyId: 'key',
  secretAccessKey: 'secret',
});

describe('s3Bucket deleteAll', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fails, instead of listing forever, when an object cannot be deleted', async () => {
    const send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockImplementation(async (command) => {
        if (command instanceof ListObjectsV2Command) {
          return { Contents: [{ Key: 'public/locked.png' }] };
        }
        if (command instanceof DeleteObjectsCommand) {
          return {
            Errors: [{ Key: 'public/locked.png', Code: 'AccessDenied' }],
          };
        }
        throw new Error('unexpected command');
      });

    await expect(bucket.deleteAll()).rejects.toThrow(
      'public/locked.png: AccessDenied',
    );
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('lists again until the bucket is empty', async () => {
    const pages = [[{ Key: 'a' }, { Key: 'b' }], []];
    const send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockImplementation(async (command) =>
        command instanceof ListObjectsV2Command
          ? { Contents: pages.shift() }
          : {},
      );

    await bucket.deleteAll();

    expect(send).toHaveBeenCalledTimes(3);
  });
});

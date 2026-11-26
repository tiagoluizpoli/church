import { describe, expect, it } from 'bun:test';
import { ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';
import { emptyBucket } from '../../worktree/storage-buckets';

interface FakeClient {
  calls: number;
  send: (command: unknown) => Promise<unknown>;
}

describe('emptyBucket', () => {
  it('fails, instead of listing forever, when an object cannot be deleted', async () => {
    const fake: FakeClient = {
      calls: 0,
      send: async (command) => {
        fake.calls += 1;
        return command instanceof ListObjectsV2Command
          ? { Contents: [{ Key: 'public/locked.png' }] }
          : { Errors: [{ Key: 'public/locked.png', Code: 'AccessDenied' }] };
      },
    };

    await expect(
      emptyBucket({ client: fake as unknown as S3Client, bucket: 'church-x' }),
    ).rejects.toThrow('public/locked.png: AccessDenied');
    expect(fake.calls).toBe(2);
  });
});

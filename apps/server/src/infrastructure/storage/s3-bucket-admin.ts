import {
  DeleteObjectsCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import type {
  S3Bucket,
  S3BucketConfig,
} from '../../domain/contracts/infrastructure/object-storage';
import { s3Client } from './s3-client';

/**
 * The environment reset's handle on the configured bucket; the app itself
 * only sees `ObjectStorage`. (Worktree buckets are tooling/worktree's.)
 */

export function s3Bucket({ bucket, ...config }: S3BucketConfig): S3Bucket {
  const client = s3Client(config);
  return {
    async assertReachable() {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    },
    async deleteAll() {
      for (;;) {
        const { Contents = [] } = await client.send(
          new ListObjectsV2Command({ Bucket: bucket }),
        );
        if (Contents.length === 0) return;
        const { Errors = [] } = await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: Contents.map(({ Key }) => ({ Key })),
              Quiet: true,
            },
          }),
        );
        // An object that cannot be deleted would be listed again forever.
        if (Errors.length > 0) {
          const failed = Errors.map(({ Key, Code }) => `${Key}: ${Code}`);
          throw new Error(`Could not empty ${bucket}: ${failed.join(', ')}`);
        }
      }
    },
  };
}

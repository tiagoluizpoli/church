import {
  DeleteObjectsCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { s3Client } from './s3-client';

/**
 * The environment reset's handle on the configured bucket; the app itself
 * only sees `ObjectStorage`. (Worktree buckets are tooling/worktree's.)
 */

export interface S3BucketConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface S3Bucket {
  /** Fails when the bucket cannot be reached. */
  assertReachable(): Promise<void>;
  /** Deletes every object; the bucket and its policy stay. */
  deleteAll(): Promise<void>;
}

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

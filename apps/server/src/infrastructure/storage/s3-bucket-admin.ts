import {
  DeleteObjectsCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

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
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
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
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: Contents.map(({ Key }) => ({ Key })),
              Quiet: true,
            },
          }),
        );
      }
    },
  };
}

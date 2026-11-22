import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutBucketPolicyCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import {
  LOCAL_STORAGE_CREDENTIAL,
  LOCAL_STORAGE_ENDPOINT,
} from './storage-targets';

/**
 * Bucket lifecycle on the root Compose RustFS (docker-compose.yml `storage`,
 * ADR-0005) for worktree bootstrap, prune and removal, and CI.
 */

export interface BucketInput {
  client: S3Client;
  bucket: string;
}

/** Anonymous GET of `public/*` only; everything else stays private. */
function publicReadPolicy(input: Pick<BucketInput, 'bucket'>): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${input.bucket}/public/*`],
      },
    ],
  });
}

async function bucketExists({ client, bucket }: BucketInput): Promise<boolean> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch (error) {
    if (
      error instanceof S3ServiceException &&
      error.$metadata.httpStatusCode === 404
    ) {
      return false;
    }
    throw error;
  }
}

/** Creates the bucket when missing and (re)applies the public-read policy.
 * Returns whether it was created. Rerunnable. */
export async function ensurePublicReadBucket(
  input: BucketInput,
): Promise<boolean> {
  const created = !(await bucketExists(input));
  if (created) {
    await input.client.send(new CreateBucketCommand({ Bucket: input.bucket }));
  }
  await input.client.send(
    new PutBucketPolicyCommand({
      Bucket: input.bucket,
      Policy: publicReadPolicy({ bucket: input.bucket }),
    }),
  );
  return created;
}

/** Deletes every object; the bucket and its policy stay. */
export async function emptyBucket({
  client,
  bucket,
}: BucketInput): Promise<void> {
  for (;;) {
    const { Contents = [] } = await client.send(
      new ListObjectsV2Command({ Bucket: bucket }),
    );
    if (Contents.length === 0) return;
    const { Errors = [] } = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: Contents.map(({ Key }) => ({ Key })), Quiet: true },
      }),
    );
    // An object that cannot be deleted would be listed again forever.
    if (Errors.length > 0) {
      const failed = Errors.map(({ Key, Code }) => `${Key}: ${Code}`);
      throw new Error(`Could not empty ${bucket}: ${failed.join(', ')}`);
    }
  }
}

/** Empties and deletes the bucket; false when it was already absent. */
export async function deleteBucket(input: BucketInput): Promise<boolean> {
  if (!(await bucketExists(input))) return false;
  await emptyBucket(input);
  await input.client.send(new DeleteBucketCommand({ Bucket: input.bucket }));
  return true;
}

export async function listBuckets(
  input: Pick<BucketInput, 'client'>,
): Promise<string[]> {
  const { Buckets = [] } = await input.client.send(new ListBucketsCommand({}));
  return Buckets.flatMap(({ Name }) => (Name ? [Name] : []));
}

/** The root Compose RustFS's admin client (path-style, local credentials). */
interface LocalStorageClientInput {
  /** Defaults to the local RustFS; CI container jobs reach their service by name. */
  endpoint?: string;
}

export function localStorageClient({
  endpoint = LOCAL_STORAGE_ENDPOINT,
}: LocalStorageClientInput = {}): S3Client {
  return new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: LOCAL_STORAGE_CREDENTIAL,
      secretAccessKey: LOCAL_STORAGE_CREDENTIAL,
    },
  });
}

// CI has no db:bootstrap: `bun tooling/worktree/storage-buckets.ts <bucket>`
// creates the job's bucket on its RustFS service container (at S3_ENDPOINT
// when set, as in the container-based E2E jobs).
if (import.meta.main) {
  const [bucket] = process.argv.slice(2);
  if (!bucket) throw new Error('Usage: storage-buckets.ts <bucket>');
  await ensurePublicReadBucket({
    client: localStorageClient({ endpoint: process.env.S3_ENDPOINT }),
    bucket,
  });
  console.log(`storage bucket ${bucket}: ready, public/* readable`);
}

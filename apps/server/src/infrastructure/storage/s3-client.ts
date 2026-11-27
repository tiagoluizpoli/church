import { S3Client } from '@aws-sdk/client-s3';
import type { S3ClientConfig } from '../../domain/contracts/infrastructure/object-storage';

/** A path-style client for any S3-compatible host (RustFS). */
export function s3Client(config: S3ClientConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

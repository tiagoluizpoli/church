import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type {
  ObjectKeyInput,
  ObjectStorage,
  PutObjectInput,
} from '../../domain/contracts/infrastructure/object-storage';

export interface S3ObjectStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Base the public URL of a key is built on, e.g. `https://host/<bucket>`. */
  publicUrl: string;
}

/** `ObjectStorage` on any S3-compatible host (RustFS), path-style addressed. */
export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBase: string;

  constructor(config: S3ObjectStorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    this.bucket = config.bucket;
    this.publicBase = config.publicUrl.replace(/\/+$/, '');
  }

  async put(input: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: input.cacheControl,
      }),
    );
  }

  async delete(input: ObjectKeyInput): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: input.key }),
    );
  }

  publicUrl(input: ObjectKeyInput): string {
    return `${this.publicBase}/${input.key.split('/').map(encodeURIComponent).join('/')}`;
  }
}

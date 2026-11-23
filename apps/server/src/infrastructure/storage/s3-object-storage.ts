import {
  DeleteObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import type {
  ObjectKeyInput,
  ObjectStorage,
  PutObjectInput,
} from '../../domain/contracts/infrastructure/object-storage';
import { s3Client } from './s3-client';

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
    this.client = s3Client(config);
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

  async exists(input: ObjectKeyInput): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: input.key }),
      );
      return true;
    } catch (error) {
      if (error instanceof NotFound) return false;
      throw error;
    }
  }

  publicUrl(input: ObjectKeyInput): string {
    return `${this.publicBase}/${input.key.split('/').map(encodeURIComponent).join('/')}`;
  }
}

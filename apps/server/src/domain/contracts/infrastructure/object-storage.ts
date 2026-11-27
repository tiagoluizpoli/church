export interface PutObjectInput {
  key: string;
  body: Uint8Array;
  contentType: string;
  cacheControl: string;
}

export interface ObjectKeyInput {
  key: string;
}

/**
 * Generic object storage (S3-compatible). Objects under `public/` are
 * anonymously readable; callers persist keys, never URLs.
 */
export interface ObjectStorage {
  put(input: PutObjectInput): Promise<void>;
  delete(input: ObjectKeyInput): Promise<void>;
  /** Whether an object is stored at `key`. */
  exists(input: ObjectKeyInput): Promise<boolean>;
  /** The anonymous URL of `key`, from the configured public base. */
  publicUrl(input: ObjectKeyInput): string;
}

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

export interface S3ClientConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface S3ObjectStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Base the public URL of a key is built on, e.g. `https://host/<bucket>`. */
  publicUrl: string;
}

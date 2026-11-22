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
  /** The anonymous URL of `key`, from the configured public base. */
  publicUrl(input: ObjectKeyInput): string;
}

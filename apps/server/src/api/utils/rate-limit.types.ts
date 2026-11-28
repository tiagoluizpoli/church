/** Each limited surface counts in its own bucket, so windows never share a key. */
export type RateLimitBucket =
  | 'redemption'
  | 'public-church-profile'
  | 'public-church-events'
  | 'public-church-page'
  | 'error-report';

/** The configured window: at most `maxRequests` attempts per `windowMs`. */
export interface RateLimitPolicy {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitInput {
  bucket: RateLimitBucket;
  /** The client within the bucket, such as its IP. */
  key: string;
  limit: RateLimitPolicy;
  now?: number;
}

export interface RateLimitHitInput extends RateLimitPolicy {
  key: string;
  now: number;
}

export interface RateLimitStore {
  /** Records an attempt for `key`; true once it exceeds `maxRequests` within the window. */
  hit(input: RateLimitHitInput): boolean;
  /** How many keys the store holds. */
  readonly size: number;
}

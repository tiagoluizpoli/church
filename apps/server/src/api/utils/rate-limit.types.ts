export interface RateLimitInput {
  /** Callers prefix their keys so their windows never share a bucket. */
  key: string;
  windowMs: number;
  maxRequests: number;
  now?: number;
}

export interface RedactUrlInput {
  url: string;
}

export interface AllowedHeadersInput {
  headers: Record<string, unknown>;
}

export interface ScrubEventInput {
  event: unknown;
}

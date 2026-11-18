/** The request facts a report or log line may carry; the privacy module trims them. */
export interface ReportedRequest {
  method: string;
  url: string;
  headers: Record<string, unknown>;
}

export interface ErrorReport {
  error: unknown;
  traceId?: string;
  userId?: string;
  churchId?: string;
  request?: ReportedRequest;
  /** Extra id tags, e.g. the outbox message id. */
  tags?: Record<string, string>;
}

/** Sends an unexpected error to the error tracker; a no-op when reporting is off. */
export interface ErrorReporter {
  report(report: ErrorReport): void;
}

export interface InSpanInput<T> {
  name: string;
  run: () => Promise<T>;
}

/** The tracer, as application code sees it: spans and the active trace id. */
export interface Tracing {
  /** Runs `run` inside a new active span, so the work it does nests under it. */
  inSpan<T>(input: InSpanInput<T>): Promise<T>;
  /** The active span's trace id, or undefined outside a recorded trace. */
  activeTraceId(): string | undefined;
}

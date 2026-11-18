import { isSpanContextValid, trace } from '@opentelemetry/api';
import type {
  InSpanInput,
  Tracing,
} from '../../domain/contracts/infrastructure/tracing';

/** The server's OpenTelemetry service and tracer name. */
export const SERVICE_NAME = 'church-server';

const tracer = trace.getTracer(SERVICE_NAME);

export class OtelTracing implements Tracing {
  inSpan<T>({ name, run }: InSpanInput<T>): Promise<T> {
    return tracer.startActiveSpan(name, async (span) => {
      try {
        return await run();
      } finally {
        span.end();
      }
    });
  }

  activeTraceId(): string | undefined {
    const spanContext = trace.getActiveSpan()?.spanContext();
    return spanContext && isSpanContextValid(spanContext)
      ? spanContext.traceId
      : undefined;
  }
}

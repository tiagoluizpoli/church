export type EnvelopeRefusal = 'malformed' | 'foreignDsn' | 'notError';

/** The scrubbed envelope to forward. */
export interface AcceptedEnvelope {
  accepted: true;
  envelope: string;
}

export interface RefusedEnvelope {
  accepted: false;
  refusal: EnvelopeRefusal;
}

export type ErrorEnvelopeOutcome = AcceptedEnvelope | RefusedEnvelope;

export interface ParseErrorEnvelopeInput {
  body: unknown;
  /** Our own DSN; an envelope addressed to any other is refused. */
  dsn: string;
}

export interface EnvelopeUrlInput {
  dsn: string;
}

export interface ForwardEnvelopeInput {
  url: string;
  envelope: string;
  timeoutMs: number;
  onFailure: (error: unknown) => void;
}

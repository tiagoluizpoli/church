/**
 * The generic delivery core (ADR-0008). It knows nothing about Churches:
 * the recipient, kinds, data, addresses and content are type parameters the
 * application fixes when it registers its sinks.
 */

/**
 * One sink's result for one delivery. `delivered` and `skipped` settle the
 * sink; `retryable` asks for a later whole-row retry; `terminal` settles it
 * as failed without undoing another sink's delivery.
 */
export type SinkOutcome =
  | { status: 'delivered' }
  | { status: 'skipped'; reason: string }
  | { status: 'retryable'; reason: string }
  | { status: 'terminal'; reason: string };

export type SinkOutcomeStatus = SinkOutcome['status'];

export interface RecipientLookupInput<TRecipient> {
  to: TRecipient;
}

/** Finds the recipient's address on one channel; `null` skips that sink. */
export type RecipientLookup<TRecipient, TAddress> = (
  input: RecipientLookupInput<TRecipient>,
) => Promise<TAddress | null>;

export interface NotificationTemplateInput<TData, TAddress> {
  data: TData;
  address: TAddress;
}

/** Renders one kind's content for one channel. */
export type NotificationTemplate<TData, TAddress, TContent> = (
  input: NotificationTemplateInput<TData, TAddress>,
) => TContent;

export interface SinkDeliverInput<TRecipient, TAddress, TContent> {
  to: TRecipient;
  address: TAddress;
  /** Stable for every attempt of one delivery: the sink's idempotency key. */
  deliveryId: string;
  /** Renders the content; a sink that already froze it for this delivery reuses that instead. */
  render: () => TContent;
}

export interface NotificationSink<TRecipient, TAddress, TContent> {
  deliver(
    input: SinkDeliverInput<TRecipient, TAddress, TContent>,
  ): Promise<SinkOutcome>;
}

/** A sink with its own switch, address lookup and per-kind templates. */
export interface SinkRegistration<
  TRecipient,
  TKind extends string,
  TData,
  TAddress,
  TContent,
> {
  name: string;
  enabled: boolean;
  lookup: RecipientLookup<TRecipient, TAddress>;
  templates: Partial<
    Record<TKind, NotificationTemplate<TData, TAddress, TContent>>
  >;
  sink: NotificationSink<TRecipient, TAddress, TContent>;
}

export interface NotifierSendInput<TRecipient, TKind extends string, TData> {
  to: TRecipient;
  kind: TKind;
  data: TData;
  /** Derived from the transport row, so a whole-row retry reuses it. */
  deliveryId: string;
  /** Sinks an earlier attempt of this delivery already settled; not attempted again. */
  settledSinks?: readonly string[];
}

export interface NotifierSendResult {
  /** One outcome per attempted sink, by sink name. */
  outcomes: Record<string, SinkOutcome>;
}

export interface INotifier<TRecipient, TKind extends string, TData> {
  /** Attempts every unsettled sink; one sink's failure never stops another. */
  send(
    input: NotifierSendInput<TRecipient, TKind, TData>,
  ): Promise<NotifierSendResult>;
}

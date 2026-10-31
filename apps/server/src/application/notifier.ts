import type {
  INotifier,
  NotifierSendInput,
  NotifierSendResult,
  SinkOutcome,
  SinkRegistration,
} from '../domain/contracts/application/notifier';

/** A registration with its address and content types closed over. */
export interface RegisteredSink<TRecipient, TKind extends string, TData> {
  name: string;
  attempt(
    input: NotifierSendInput<TRecipient, TKind, TData>,
  ): Promise<SinkOutcome>;
}

export function registerSink<
  TRecipient,
  TKind extends string,
  TData,
  TAddress,
  TContent,
>(
  registration: SinkRegistration<TRecipient, TKind, TData, TAddress, TContent>,
): RegisteredSink<TRecipient, TKind, TData> {
  const { name, enabled, lookup, templates, sink } = registration;
  return {
    name,
    async attempt({ to, kind, data, deliveryId }) {
      if (!enabled) return { status: 'skipped', reason: `${name} is disabled` };
      const template = templates[kind];
      if (!template) {
        return {
          status: 'skipped',
          reason: `${name} has no "${kind}" template`,
        };
      }
      const address = await lookup({ to });
      if (address === null) {
        return {
          status: 'skipped',
          reason: `${name} found no recipient address`,
        };
      }
      return sink.deliver({
        to,
        address,
        deliveryId,
        render: () => template({ data, address }),
      });
    },
  };
}

interface NotifierInput<TRecipient, TKind extends string, TData> {
  sinks: RegisteredSink<TRecipient, TKind, TData>[];
}

export class Notifier<TRecipient, TKind extends string, TData>
  implements INotifier<TRecipient, TKind, TData>
{
  private readonly sinks: RegisteredSink<TRecipient, TKind, TData>[];

  constructor({ sinks }: NotifierInput<TRecipient, TKind, TData>) {
    this.sinks = sinks;
  }

  async send(
    input: NotifierSendInput<TRecipient, TKind, TData>,
  ): Promise<NotifierSendResult> {
    const settled = new Set(input.settledSinks ?? []);
    const attempted = await Promise.all(
      this.sinks
        .filter((sink) => !settled.has(sink.name))
        .map(async (sink) => {
          const outcome = await sink.attempt(input).catch(
            (error: unknown): SinkOutcome => ({
              status: 'retryable',
              reason: error instanceof Error ? error.message : String(error),
            }),
          );
          if (outcome.status !== 'delivered') {
            console.warn(
              `[Notifier] ${sink.name} ${outcome.status} delivery ${input.deliveryId} (${input.kind}): ${outcome.reason}`,
            );
          }
          return [sink.name, outcome] as const;
        }),
    );
    return { outcomes: Object.fromEntries(attempted) };
  }
}

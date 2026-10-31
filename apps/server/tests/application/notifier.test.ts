import { describe, expect, it, vi } from 'vitest';
import { Notifier, registerSink } from '@/application/notifier';
import type { SinkOutcome } from '@/domain/contracts/application/notifier';

type Kind = 'greeting' | 'farewell';

interface SinkForInput {
  name: string;
  deliver?: () => Promise<SinkOutcome>;
  templates?: Partial<Record<Kind, () => string>>;
}

function sinkFor({
  name,
  deliver = async () => ({ status: 'delivered' }),
  templates = { greeting: () => 'hello' },
}: SinkForInput) {
  return registerSink<string, Kind, string, string, string>({
    name,
    enabled: true,
    lookup: async ({ to }) => to,
    templates,
    sink: { deliver: vi.fn(deliver) },
  });
}

const send = { to: 'someone', data: 'facts', deliveryId: 'row-1' } as const;

describe('Notifier', () => {
  it('skips a sink with no template for the kind and still delivers through the others', async () => {
    const notifier = new Notifier({
      sinks: [
        sinkFor({ name: 'email' }),
        sinkFor({ name: 'inbox', templates: {} }),
      ],
    });

    const { outcomes } = await notifier.send({ ...send, kind: 'greeting' });

    expect(outcomes).toEqual({
      email: { status: 'delivered' },
      inbox: { status: 'skipped', reason: expect.stringContaining('template') },
    });
  });

  it('attempts every sink when one throws, reporting the thrown one as retryable', async () => {
    const notifier = new Notifier({
      sinks: [
        sinkFor({
          name: 'email',
          deliver: async () => {
            throw new Error('provider down');
          },
        }),
        sinkFor({ name: 'inbox' }),
      ],
    });

    const { outcomes } = await notifier.send({ ...send, kind: 'greeting' });

    expect(outcomes).toEqual({
      email: { status: 'retryable', reason: 'provider down' },
      inbox: { status: 'delivered' },
    });
  });

  it('does not attempt sinks an earlier attempt already settled', async () => {
    const notifier = new Notifier({
      sinks: [sinkFor({ name: 'email' }), sinkFor({ name: 'inbox' })],
    });

    const { outcomes } = await notifier.send({
      ...send,
      kind: 'greeting',
      settledSinks: ['email'],
    });

    expect(Object.keys(outcomes)).toEqual(['inbox']);
  });
});

import * as Sentry from '@sentry/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  initErrorReporting,
  reportCrash,
} from '@/shared/utils/error-reporting';
import {
  REPORT_ENVIRONMENT,
  serveTunnel,
} from '@/tests/setup/error-report-tunnel';

const REVISION = 'unversioned';

afterEach(async () => {
  await Sentry.close();
});

function rejectUnhandled(reason: unknown): void {
  const event = Object.assign(new Event('unhandledrejection'), {
    reason,
    promise: Promise.resolve(),
  });
  window.dispatchEvent(event);
}

describe('web error reporting', () => {
  it('reports an unhandled rejection through the tunnel, tagged, errors only', async () => {
    const tunnel = serveTunnel({ reporting: 'on' });
    await initErrorReporting();

    rejectUnhandled(new TypeError('lost promise'));

    await expect.poll(() => tunnel.items.length).toBe(1);
    const [item] = tunnel.items;
    expect(item?.type).toBe('event');
    expect(item?.payload).toMatchObject({
      environment: REPORT_ENVIRONMENT,
      release: REVISION,
      tags: { environment: REPORT_ENVIRONMENT, revision: REVISION },
      exception: {
        values: [
          {
            type: 'TypeError',
            value: 'lost promise',
            mechanism: {
              type: 'auto.browser.global_handlers.onunhandledrejection',
              handled: false,
            },
          },
        ],
      },
    });
  });

  it('sends no replay, performance, session or client-report data', async () => {
    const tunnel = serveTunnel({ reporting: 'on' });
    await initErrorReporting();

    reportCrash({ error: new Error('render crash') });
    rejectUnhandled(new Error('lost promise'));
    await Sentry.flush();

    await expect.poll(() => tunnel.items.length).toBe(2);
    expect(tunnel.items.map(({ type }) => type)).toEqual(['event', 'event']);
    const integrations = Sentry.getClient()
      ?.getOptions()
      .integrations.map(({ name }) => name);
    expect(integrations).toEqual(['GlobalHandlers', 'LinkedErrors', 'Dedupe']);
    expect(Sentry.getClient()?.getOptions().tracesSampleRate).toBeUndefined();
  });

  it('stays off and reports nothing when the API says reporting is off', async () => {
    const tunnel = serveTunnel({ reporting: 'off' });
    await initErrorReporting();

    expect(reportCrash({ error: new Error('render crash') })).toBeUndefined();
    rejectUnhandled(new Error('lost promise'));

    expect(Sentry.isEnabled()).toBe(false);
    expect(tunnel.items).toEqual([]);
  });
});

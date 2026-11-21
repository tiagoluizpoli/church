import { HttpResponse, http } from 'msw';
import { ERROR_REPORT_TUNNEL_URL } from '@/shared/utils/error-reporting';
import { mswServer } from '@/tests/setup/msw';

export const REPORT_DSN = 'https://public@tracker.test/1';
export const REPORT_ENVIRONMENT = 'staging';

export interface EnvelopeItem {
  type: string;
  payload: Record<string, unknown>;
}

export interface TunnelCapture {
  /** Every item of every envelope posted to the tunnel. */
  items: EnvelopeItem[];
}

interface ServeTunnelInput {
  /** Off answers 204, as the API does while reporting is off. */
  reporting: 'on' | 'off';
}

/** The API's tunnel in MSW: settings on GET, envelopes captured on POST. */
export function serveTunnel({ reporting }: ServeTunnelInput): TunnelCapture {
  const items: EnvelopeItem[] = [];
  mswServer.use(
    http.get(ERROR_REPORT_TUNNEL_URL, () =>
      reporting === 'on'
        ? HttpResponse.json({
            dsn: REPORT_DSN,
            environment: REPORT_ENVIRONMENT,
          })
        : new HttpResponse(null, { status: 204 }),
    ),
    http.post(ERROR_REPORT_TUNNEL_URL, async ({ request }) => {
      const [, ...lines] = (await request.text()).split('\n').filter(Boolean);
      for (let index = 0; index < lines.length; index += 2) {
        const header = JSON.parse(lines[index] ?? '{}');
        items.push({
          type: header.type,
          payload: JSON.parse(lines[index + 1] ?? '{}'),
        });
      }
      return new HttpResponse(null, { status: 202 });
    }),
  );
  return { items };
}

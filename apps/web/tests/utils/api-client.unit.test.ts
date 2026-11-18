import { HttpResponse, http } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mswServer } from '@/tests/setup/msw';
import { apiClient } from '@/utils/api-client';

// W3C traceparent version 00 with non-zero trace and parent ids.
const TRACEPARENT =
  /^00-(?!0{32})([0-9a-f]{32})-(?!0{16})[0-9a-f]{16}-[0-9a-f]{2}$/;

const sent: (string | null)[] = [];

beforeAll(() => {
  mswServer.listen({ onUnhandledRequest: 'error' });
  mswServer.use(
    http.all('http://localhost:3000/api/ping', ({ request }) => {
      sent.push(request.headers.get('traceparent'));
      return HttpResponse.json({});
    }),
  );
});

afterAll(() => mswServer.close());

describe('apiClient', () => {
  it('sends a fresh valid traceparent on every call', async () => {
    await apiClient({ url: '/api/ping', method: 'GET' });
    await apiClient({ url: '/api/ping', method: 'POST', data: {} });

    expect(sent).toHaveLength(2);
    for (const header of sent) expect(header).toMatch(TRACEPARENT);
    const traceIds = sent.map((header) => TRACEPARENT.exec(header ?? '')?.[1]);
    expect(traceIds[0]).not.toBe(traceIds[1]);
  });
});

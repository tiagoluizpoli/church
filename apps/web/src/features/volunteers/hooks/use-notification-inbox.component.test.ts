import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { useNotificationInbox } from './use-notification-inbox';
import { TimezoneProvider } from '@/shared/components/timezone-provider';
import { volunteerApi } from '@/utils/api-instances';

vi.mock('@/utils/api-instances', () => ({
  volunteerApi: {
    getNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  },
}));

const mockedGetNotifications = vi.mocked(volunteerApi.getNotifications);

/**
 * Pins the process ambient TZ away from both UTC and the Church Timezone
 * (ADR-0003: there is no viewer's clock — the rendered label must follow
 * `churchTimezone`, never the machine the test runs on).
 */
const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'Asia/Kolkata';
});

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderNotificationInbox() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useNotificationInbox(0), {
    wrapper: ({ children }) =>
      createElement(QueryClientProvider, {
        client: queryClient,
        children: createElement(TimezoneProvider, {
          churchTimezone: 'America/Sao_Paulo',
          children,
        }),
      }),
  });
}

describe('useNotificationInbox (T157)', () => {
  it('labels a notification as dd/MM/yyyy HH:mm and buckets it by the Church-Timezone day, not the ambient TZ', async () => {
    mockedGetNotifications.mockResolvedValue({
      items: [
        {
          id: 'notification-1',
          volunteerId: 'volunteer-1',
          type: 'schedule_published',
          title: 'Schedule published',
          body: 'A new schedule was published.',
          payload: {},
          createdAt: '2027-01-04T23:15:00.000Z',
        },
      ],
    });

    const { result } = renderNotificationInbox();

    // 23:15 UTC on 4 Jan is 20:15 in São Paulo (UTC-3) the same day, and
    // already 4:45 the next day (5 Jan) in Kolkata (UTC+5:30) — proof this
    // reads the Church Timezone, not the process's ambient ID.
    await waitFor(() =>
      expect(result.current.items[0]?.createdAtLabel).toBe('04/01/2027 20:15'),
    );
    expect(result.current.pages).toEqual([
      { dateBucketLabel: '04/01/2027', items: result.current.items },
    ]);
  });
});

import { appConfig } from '@church/app-config';
import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
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
import { useNotificationInbox } from '@/features/notifications/hooks/use-notification-inbox';
import {
  notificationQueryKey,
  readCachedNotificationInbox,
} from '@/features/notifications/lib/notification-cache';
import type { GetNotifications200 } from '@/infrastructure/api/churchAPI.schemas';
import { CallerCapabilitiesScopeProvider } from '@/shared/components/caller-capabilities-scope';
import { TimezoneProvider } from '@/shared/components/timezone-provider';
import { notificationsApi } from '@/utils/api-instances';

vi.mock('@/utils/api-instances', () => ({
  notificationsApi: {
    getNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  },
}));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

const getNotifications = vi.mocked(notificationsApi.getNotifications);
const markNotificationRead = vi.mocked(notificationsApi.markNotificationRead);
const markAllNotificationsRead = vi.mocked(
  notificationsApi.markAllNotificationsRead,
);

const MINISTRY_ID = '22222222-2222-4222-8222-222222222222';

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
  markNotificationRead.mockResolvedValue({ marked: true });
  markAllNotificationsRead.mockResolvedValue({ marked: true });
});

afterEach(() => {
  vi.clearAllMocks();
  overwriteGetLocale(() => 'pt-BR');
});

function invitation({
  id,
  ministryName = 'Worship',
  createdAt = '2027-01-04T23:15:00.000Z',
  readAt,
}: {
  id: string;
  ministryName?: string;
  createdAt?: string;
  readAt?: string;
}): GetNotifications200['items'][number] {
  return {
    id,
    kind: 'ministry_invitation',
    data: {
      ministryInvitationId: `invitation-${id}`,
      ministryId: MINISTRY_ID,
      ministryName,
    },
    createdAt,
    readAt,
  };
}

interface Scope {
  userId: string | null;
  churchId: string;
}

const DEFAULT_SCOPE: Scope = { userId: 'user-1', churchId: 'church-1' };
/** What the signed-in User and Active Church are right now; tests move it. */
let currentScope: Scope = DEFAULT_SCOPE;

function renderInbox() {
  currentScope = DEFAULT_SCOPE;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useNotificationInbox(), {
    wrapper: ({ children }: { children?: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <CallerCapabilitiesScopeProvider
          userId={currentScope.userId}
          churchId={currentScope.churchId}
        >
          <TimezoneProvider churchTimezone="America/Sao_Paulo">
            {children}
          </TimezoneProvider>
        </CallerCapabilitiesScopeProvider>
      </QueryClientProvider>
    ),
  });
}

describe('useNotificationInbox', () => {
  it('labels a notification as dd/MM/yyyy HH:mm and buckets it by the Church-Timezone day, not the ambient TZ', async () => {
    getNotifications.mockResolvedValue({
      items: [invitation({ id: 'notification-1' })],
      unreadCount: 1,
    });

    const { result } = renderInbox();

    // 23:15 UTC on 4 Jan is 20:15 in São Paulo (UTC-3) the same day, and
    // already 4:45 the next day (5 Jan) in Kolkata (UTC+5:30).
    await waitFor(() =>
      expect(result.current.items[0]?.createdAtLabel).toBe('04/01/2027 20:15'),
    );
    expect(result.current.pages).toEqual([
      { dateBucketLabel: '04/01/2027', items: result.current.items },
    ]);
  });

  it('does not reread or rewrite storage on an unrelated render', async () => {
    getNotifications.mockResolvedValue({
      items: [invitation({ id: 'a' })],
      unreadCount: 1,
    });
    const reads = vi.spyOn(window.localStorage, 'getItem');
    const writes = vi.spyOn(window.localStorage, 'setItem');
    const { result, rerender } = renderInbox();
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(reads.mock.calls.length).toBeGreaterThan(0);
    expect(writes.mock.calls.length).toBeGreaterThan(0);
    const readCount = reads.mock.calls.length;
    const writeCount = writes.mock.calls.length;
    rerender();
    expect(reads).toHaveBeenCalledTimes(readCount);
    expect(writes).toHaveBeenCalledTimes(writeCount);
    reads.mockRestore();
    writes.mockRestore();
  });

  it('reports the server unread count of the whole inbox, not the loaded rows', async () => {
    getNotifications.mockResolvedValue({
      items: [invitation({ id: 'a' })],
      nextCursor: 'cursor-1',
      unreadCount: 41,
    });

    const { result } = renderInbox();

    await waitFor(() => expect(result.current.unreadCount).toBe(41));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);
  });

  it('loads the next page by cursor and appends it in order', async () => {
    getNotifications
      .mockResolvedValueOnce({
        items: [invitation({ id: 'a' })],
        nextCursor: 'cursor-1',
        unreadCount: 2,
      })
      .mockResolvedValueOnce({
        items: [invitation({ id: 'b', createdAt: '2027-01-03T10:00:00.000Z' })],
        unreadCount: 2,
      });
    const { result } = renderInbox();
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(() => result.current.loadMore());

    expect(getNotifications).toHaveBeenLastCalledWith({ cursor: 'cursor-1' });
    expect(result.current.items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(result.current.hasMore).toBe(false);
  });

  it('opens the detail and marks it read without navigating', async () => {
    getNotifications.mockResolvedValue({
      items: [invitation({ id: 'a' }), invitation({ id: 'b' })],
      unreadCount: 7,
    });
    const { result } = renderInbox();
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    act(() => result.current.openNotification('a'));

    expect(result.current.selectedNotification?.id).toBe('a');
    await waitFor(() => expect(result.current.unreadCount).toBe(6));
    expect(markNotificationRead).toHaveBeenCalledWith('a');
    expect(result.current.items[0]?.isUnread).toBe(false);
    expect(result.current.items[1]?.isUnread).toBe(true);
  });

  it('marks every row read, including unloaded ones, through the server', async () => {
    getNotifications.mockResolvedValue({
      items: [invitation({ id: 'a' })],
      nextCursor: 'cursor-1',
      unreadCount: 30,
    });
    const { result } = renderInbox();
    await waitFor(() => expect(result.current.unreadCount).toBe(30));

    act(() => result.current.markAllRead());

    await waitFor(() => expect(result.current.unreadCount).toBe(0));
    expect(markAllNotificationsRead).toHaveBeenCalledTimes(1);
    expect(result.current.items.every((item) => !item.isUnread)).toBe(true);
  });

  it('opens a publication with its full translated detail in the Church Timezone', async () => {
    getNotifications.mockResolvedValue({
      items: [
        {
          id: 'published-1',
          kind: 'schedule_published',
          data: {
            cycleId: MINISTRY_ID,
            cycleName: 'Dezembro 2026',
            ministryId: MINISTRY_ID,
            ministryName: 'Louvor',
            churchTimezone: 'America/Sao_Paulo',
            shifts: [
              {
                eventTitle: 'Vigília de Natal',
                roleName: 'Violão',
                sectorName: 'Palco',
                startsAt: '2026-12-25T02:30:00.000Z',
                endsAt: '2026-12-25T04:00:00.000Z',
              },
            ],
          },
          createdAt: '2026-12-20T12:00:00.000Z',
        },
      ],
      unreadCount: 1,
    });
    const { result } = renderInbox();
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    act(() => result.current.openNotification('published-1'));

    expect(result.current.selectedNotification?.title).toBe(
      'Escala de Louvor publicada',
    );
    expect(result.current.selectedNotification?.body).toContain(
      'A escala de Dezembro 2026 foi publicada para Louvor.',
    );
    expect(result.current.selectedNotification?.body).toContain(
      '23:30–01:00 · Vigília de Natal · Violão · Palco',
    );
  });

  it('rerenders cached history in the new locale', async () => {
    getNotifications.mockResolvedValue({
      items: [invitation({ id: 'a', ministryName: 'Worship' })],
      unreadCount: 1,
    });
    const { result, rerender } = renderInbox();
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0]?.title).toBe(
      m.notification_ministry_invitation_title({ ministryName: 'Worship' }),
    );

    overwriteGetLocale(() => 'en');
    rerender();

    expect(result.current.items[0]?.title).toBe(
      m.notification_ministry_invitation_title({ ministryName: 'Worship' }),
    );
    expect(result.current.items[0]?.title).toBe('You were invited to Worship');
  });

  it.each([
    'availability_opened',
    'availability_reminder',
  ] as const)('%s keeps old and new inbox rows readable when the viewing locale changes', async (kind) => {
    const data = {
      cycleId: MINISTRY_ID,
      ministryId: MINISTRY_ID,
      ministryName: 'Louvor',
      cycleName: 'Dezembro 2026',
      cycleStartDate: '2026-12-01',
      cycleEndDate: '2026-12-31',
    };
    getNotifications.mockResolvedValue({
      items: [
        {
          id: 'legacy-availability',
          kind,
          data,
          createdAt: '2026-11-01T12:00:00.000Z',
        },
        {
          id: 'current-availability',
          kind,
          data: { ...data, shiftCount: 12, answerBy: '2026-11-20' },
          createdAt: '2026-11-02T12:00:00.000Z',
        },
      ],
      unreadCount: 2,
    });
    overwriteGetLocale(() => 'pt-BR');
    const { result, rerender } = renderInbox();
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    for (const locale of ['pt-BR', 'en'] as const) {
      overwriteGetLocale(() => locale);
      rerender();
      const language = { locale };
      const days = { startDate: '01/12/2026', endDate: '31/12/2026' };
      const names = { ministryName: 'Louvor', cycleName: 'Dezembro 2026' };
      const title =
        kind === 'availability_opened'
          ? m.notification_availability_opened_title(names, language)
          : m.notification_availability_reminder_title(names, language);
      const shifts = m.notification_availability_shifts_other(
        { count: 12 },
        language,
      );
      const countAndSpan =
        kind === 'availability_opened'
          ? m.notification_availability_opened_body(
              { shifts, ...days },
              language,
            )
          : m.notification_availability_reminder_body(
              { shifts, ...days },
              language,
            );
      const markOnly = m.notification_availability_mark_only({}, language);
      const actionLabel = m.email_availability_action({}, language);

      expect(result.current.items[0]).toMatchObject({
        title,
        body: [m.notification_availability_span(days, language), markOnly].join(
          '\n',
        ),
        actionLabel,
      });
      expect(result.current.items[1]).toMatchObject({
        title,
        body: [
          countAndSpan,
          m.notification_availability_answer_by(
            { deadline: '20/11/2026' },
            language,
          ),
          markOnly,
        ].join('\n'),
        actionLabel,
      });
      act(() => result.current.openNotification('current-availability'));
      expect(result.current.selectedNotification).toMatchObject({
        title,
        body: result.current.items[1]?.body,
        actionLabel,
      });
    }
  });

  it('shows none of the previous inbox after the Active Church or User changes', async () => {
    getNotifications.mockImplementation(async () => ({
      items: [invitation({ id: 'church-1-row' })],
      unreadCount: 3,
    }));
    const { result, rerender } = renderInbox();
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    act(() => result.current.openNotification('church-1-row'));
    expect(result.current.selectedNotification).toBeDefined();

    getNotifications.mockImplementation(
      () => new Promise<GetNotifications200>(() => {}),
    );
    currentScope = { userId: 'user-1', churchId: 'church-2' };
    rerender();

    expect(result.current.items).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.selectedNotification).toBeUndefined();

    currentScope = { userId: 'user-2', churchId: 'church-1' };
    rerender();

    expect(result.current.items).toEqual([]);
    expect(result.current.selectedNotification).toBeUndefined();
  });

  it('stores semantic data under a User/Church key and drops the old unscoped cache', async () => {
    window.localStorage.setItem(
      'volunteer-dashboard:notifications',
      JSON.stringify({ loadedPages: [[{ id: 'old' }]] }),
    );
    getNotifications.mockResolvedValue({
      items: [invitation({ id: 'a' })],
      unreadCount: 1,
    });
    renderInbox();

    await waitFor(() =>
      expect(
        readCachedNotificationInbox({ userId: 'user-1', churchId: 'church-1' })
          ?.pages[0]?.[0]?.kind,
      ).toBe('ministry_invitation'),
    );
    expect(
      window.localStorage.getItem('volunteer-dashboard:notifications'),
    ).toBeNull();
    expect(
      readCachedNotificationInbox({ userId: 'user-1', churchId: 'church-2' }),
    ).toBeUndefined();
    expect(notificationQueryKey({ userId: 'u', churchId: 'c' })).toEqual([
      'notifications',
      'u',
      'c',
    ]);
  });

  it('polls on the configured interval', () => {
    expect(appConfig.notifications.pollIntervalMs).toBe(2 * 60 * 1000);
  });
});

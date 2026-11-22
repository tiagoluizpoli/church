import { m } from '@church/i18n/messages';
import { screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  CYCLE_ID,
  EVENT,
  MINISTRY_ID,
  ROLES,
  SCHEDULE,
  SECTORS,
} from './preparation-block.fixtures';
import { activeChurchApiMock } from '@/tests/setup/active-church';
import { callerCapabilitiesFixture } from '@/tests/setup/caller-capabilities';
import { renderRoute } from '@/tests/setup/render-route';

const api = vi.hoisted(() => ({
  getCycleAvailabilityStatus: vi.fn(),
  listMinistries: vi.fn(),
  listScheduleSummaries: vi.fn(),
  getCycleParticipation: vi.fn(),
  getSchedule: vi.fn(),
  listSectors: vi.fn(),
  listMinistryRoles: vi.fn(),
}));
vi.mock('@/utils/api-instances', async () => ({
  adminApi: api,
  notificationsApi: {
    getNotifications: async () => ({ items: [], unreadCount: 0 }),
  },
  callerCapabilitiesApi: {
    getCallerCapabilities: async () =>
      callerCapabilitiesFixture({ ledMinistries: 1 }),
  },
  activeChurchApi: (await import('@/tests/setup/active-church'))
    .activeChurchApiMock,
}));
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    getSession: vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'u1' }, session: {} } }),
    useSession: () => ({ data: null, isPending: false }),
  },
}));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  api.getCycleAvailabilityStatus.mockResolvedValue({
    asked: 1,
    confirmed: 0,
    answerBy: null,
    remindAvailableAt: null,
    counts: { pending: 1, available: 0, unavailable: 0 },
    nextCursor: null,
    statuses: [
      {
        volunteerId: 'v1',
        volunteerName: 'Ana',
        state: 'pending',
        unavailableShiftCount: 0,
        shiftCount: 2,
      },
    ],
  });
  api.listMinistries.mockRejectedValue(new Error('admin-only read'));
  api.listScheduleSummaries.mockResolvedValue({ cycles: [] });
  api.getCycleParticipation.mockResolvedValue({
    dayMarkers: ['2027-01-03'],
    totals: { blocks: 1, needsAttention: 0 },
    events: [EVENT],
  });
  api.getSchedule.mockResolvedValue(SCHEDULE);
  api.listSectors.mockResolvedValue({ sectors: SECTORS });
  api.listMinistryRoles.mockResolvedValue({ roles: ROLES });
  activeChurchApiMock.listActiveChurchOptions.mockResolvedValue({
    churches: [],
  });
});

it.each([
  'asking',
  'assigning',
  'published',
] as const)('mounts Answers for an %s Schedule and respects read-only state', async (stage) => {
  api.getSchedule.mockResolvedValue({ ...SCHEDULE, stage });
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  expect(await screen.findByTestId('prepare-stat-answers')).toHaveTextContent(
    '0/1',
  );
  if (stage === 'published')
    expect(
      screen.queryByRole('button', { name: m.answers_edit_deadline() }),
    ).not.toBeInTheDocument();
  else
    expect(
      screen.getByRole('button', { name: m.answers_edit_deadline() }),
    ).toBeVisible();
});

it('keeps Past Schedule Answers readable without Deadline editing', async () => {
  api.getSchedule.mockResolvedValue({
    ...SCHEDULE,
    stage: 'asking',
    cycle: { ...SCHEDULE.cycle, state: 'past' },
  });
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  expect(await screen.findByTestId('prepare-stat-answers')).toHaveTextContent(
    '0/1',
  );
  expect(
    screen.queryByRole('button', { name: m.answers_edit_deadline() }),
  ).not.toBeInTheDocument();
});

it.each([
  'to_prepare',
  'not_serving',
] as const)('does not read Answers before Ask or when %s', async (stage) => {
  api.getSchedule.mockResolvedValue({ ...SCHEDULE, stage });
  renderRoute({
    initialPath: `/app/schedules/${MINISTRY_ID}/${CYCLE_ID}`,
    churchTimezone: 'America/Sao_Paulo',
  });
  await screen.findByTestId('prepare-workspace-stack');
  expect(
    screen.queryByTestId('availability-status-list'),
  ).not.toBeInTheDocument();
  expect(api.getCycleAvailabilityStatus).not.toHaveBeenCalled();
});

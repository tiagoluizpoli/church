import { m } from '@church/i18n/messages';
import { screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ScheduleExport } from '@/features/scheduling/components/prepare/schedule-export';
import type {
  GetEventGroups200,
  GetSchedule200,
} from '@/infrastructure/api/churchAPI.schemas';
import { SCHEDULE } from '@/tests/features/scheduling/components/prepare/preparation-block.fixtures';
import { waitForDialogFocus } from '@/tests/setup/dialog';
import { renderWithProviders } from '@/tests/setup/render';

const state = vi.hoisted(() => ({
  data: undefined as GetSchedule200 | undefined,
  getEventGroups: vi.fn(),
}));
vi.mock('@/features/scheduling/hooks/use-schedule', () => ({
  useSchedule: () => ({ data: state.data }),
}));
vi.mock('@/utils/api-instances', () => ({
  adminApi: { getEventGroups: state.getEventGroups },
  exportApi: { getScheduleExportFile: vi.fn() },
}));

interface LinkMockProps {
  to: string;
  params: Record<string, string>;
  search: Record<string, string>;
  children: ReactNode;
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, search, children }: LinkMockProps) => {
    const path = to.replace(/\$(\w+)/g, (_, key: string) => params[key] ?? '');
    return <a href={`${path}?${new URLSearchParams(search)}`}>{children}</a>;
  },
}));

const TEMPLATES = [{ id: 't1', name: 'Culto de Domingo' }];

beforeEach(() => {
  vi.resetAllMocks();
  state.data = { ...SCHEDULE, stage: 'published' };
});

async function openDialog() {
  renderWithProviders(<ScheduleExport ministryId="m" cycleId="c" />);
  screen.getByRole('button', { name: m.export_open() }).click();
  await waitForDialogFocus();
  return screen.getByRole('dialog', { name: m.export_dialog_title() });
}

it('shows the Ministry groups with the catch-all last, and links to organize them', async () => {
  state.getEventGroups.mockResolvedValue({
    groups: [
      { name: 'Domingos', templates: TEMPLATES },
      { name: 'Quartas', templates: [] },
    ],
    catchAllName: null,
    templates: TEMPLATES,
  } satisfies GetEventGroups200);
  const dialog = await openDialog();

  expect(
    await within(dialog).findByText(
      `Domingos · Quartas · ${m.export_catch_all_default()}`,
    ),
  ).toBeVisible();
  expect(
    within(dialog).getByRole('link', { name: m.export_groups_organize() }),
  ).toHaveAttribute('href', '/app/ministries/m/event-groups?cycleId=c');
});

it('names a renamed catch-all, and says one list when there are no groups', async () => {
  state.getEventGroups.mockResolvedValueOnce({
    groups: [{ name: 'Domingos', templates: TEMPLATES }],
    catchAllName: 'Especiais',
    templates: TEMPLATES,
  } satisfies GetEventGroups200);
  const dialog = await openDialog();
  expect(await within(dialog).findByText('Domingos · Especiais')).toBeVisible();
});

it('says one list when the Ministry has no groups', async () => {
  state.getEventGroups.mockResolvedValue({
    groups: [],
    catchAllName: null,
    templates: TEMPLATES,
  } satisfies GetEventGroups200);
  const dialog = await openDialog();
  expect(await within(dialog).findByText(m.export_groups_none())).toBeVisible();
});

it('opens at once when the Event groups tab links back', async () => {
  state.getEventGroups.mockResolvedValue({
    groups: [],
    catchAllName: null,
    templates: [],
  } satisfies GetEventGroups200);
  const onOpened = vi.fn();
  renderWithProviders(
    <ScheduleExport
      ministryId="m"
      cycleId="c"
      initialOpen
      onOpened={onOpened}
    />,
  );
  await waitForDialogFocus();
  expect(
    screen.getByRole('dialog', { name: m.export_dialog_title() }),
  ).toBeVisible();
  expect(onOpened).toHaveBeenCalledOnce();
});

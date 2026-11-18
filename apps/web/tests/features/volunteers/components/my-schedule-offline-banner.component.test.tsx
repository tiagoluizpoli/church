import { overwriteGetLocale } from '@church/i18n/runtime';
import { screen } from '@testing-library/react';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { MyScheduleOfflineBanner } from '@/features/volunteers/components/my-schedule-offline-banner';
import { renderWithProviders } from '@/tests/setup/render';

/**
 * Pins the process ambient TZ away from both UTC and the Church Timezone
 * (ADR-0003: there is no viewer's clock — the rendered time must follow
 * `churchTimezone`, never the machine the test runs on).
 */
const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'Asia/Kolkata';
});

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

afterEach(() => overwriteGetLocale(() => 'en'));

const STRINGS = {
  en: {
    offline: 'Offline mode',
    cached: 'Showing last-known schedule data',
    failed: 'Refresh failed. Your last-known schedule stayed visible.',
    refresh: 'Refresh schedule',
    refreshing: 'Refreshing schedule…',
  },
  'pt-BR': {
    offline: 'Modo offline',
    cached: 'Mostrando os últimos dados da escala',
    failed: 'Falha ao atualizar. Sua última escala conhecida continua visível.',
    refresh: 'Atualizar escala',
    refreshing: 'Atualizando escala…',
  },
} as const;

describe.each([
  'en',
  'pt-BR',
] as const)('MyScheduleOfflineBanner states (%s)', (locale) => {
  const t = STRINGS[locale];
  const render = (
    props: Partial<React.ComponentProps<typeof MyScheduleOfflineBanner>>,
  ) => {
    overwriteGetLocale(() => locale);
    return renderWithProviders(
      <MyScheduleOfflineBanner
        isOffline={false}
        isUsingCachedData={false}
        onRefresh={vi.fn()}
        refreshState="idle"
        {...props}
      />,
    );
  };

  it('renders nothing when online, fresh and idle', () => {
    const { container } = render({});
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the offline state with an enabled refresh action', () => {
    render({ isOffline: true, isUsingCachedData: true });
    expect(screen.getByText(t.offline)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.refresh })).toBeEnabled();
  });

  it('shows the cached state', () => {
    render({ isUsingCachedData: true });
    expect(screen.getByText(t.cached)).toBeInTheDocument();
  });

  it('shows the refresh-error state', () => {
    render({ refreshState: 'error' });
    expect(screen.getByText(t.failed)).toBeInTheDocument();
  });

  it('disables the action while refreshing', () => {
    render({ isUsingCachedData: true, refreshState: 'refreshing' });
    expect(screen.getByRole('button', { name: t.refreshing })).toBeDisabled();
  });
});

describe('MyScheduleOfflineBanner (T157)', () => {
  it('renders the last-updated instant as dd/MM/yyyy HH:mm in the Church Timezone, not the ambient TZ', () => {
    renderWithProviders(
      <MyScheduleOfflineBanner
        isOffline={false}
        isUsingCachedData
        lastUpdatedAt="2027-01-04T23:15:00.000Z"
        onRefresh={vi.fn()}
        refreshState="idle"
      />,
      { churchTimezone: 'America/Sao_Paulo' },
    );

    // 23:15 UTC on 4 Jan is 20:15 in São Paulo (UTC-3) the same day, and
    // already 4:45 the next day in Kolkata (UTC+5:30) — proof this reads the
    // Church Timezone, not the process's ambient ID.
    expect(
      screen.getByText('Last updated: 04/01/2027 20:15'),
    ).toBeInTheDocument();
  });
});

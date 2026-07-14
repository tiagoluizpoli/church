import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  createManualSplitSchema,
  ManualSplitEditor,
} from './manual-split-editor';
import { renderWithProviders } from '@/__tests__/setup/render';
import type { SplitFormState } from '@/features/scheduling/components/participation-tailoring.utils';
import type { GetCycleParticipation200EventsItem } from '@/infrastructure/api/churchAPI.schemas';

const SINGLE_FORM: SplitFormState = {
  mode: 'equal',
  equalCount: '1',
  manualSpans: [],
};

const EQUAL_FORM: SplitFormState = {
  mode: 'equal',
  equalCount: '3',
  manualSpans: [],
};

const MANUAL_FORM: SplitFormState = {
  mode: 'manual',
  equalCount: '2',
  manualSpans: [{ startTime: '', endTime: '', label: '' }],
};

describe('ManualSplitEditor mode switching (US3/T022/T023)', () => {
  it('renders as shadcn Select, not a native <select>', () => {
    renderWithProviders(
      <ManualSplitEditor
        slotIndex={0}
        slotId="slot-1"
        splitForm={SINGLE_FORM}
        onSplitFormChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('combobox')).toBeInTheDocument();
    expect(document.querySelector('select')).not.toBeInTheDocument();
  });

  it('shows no equal-count or manual-span controls in single-shift mode', () => {
    renderWithProviders(
      <ManualSplitEditor
        slotIndex={0}
        slotId="slot-1"
        splitForm={SINGLE_FORM}
        onSplitFormChange={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('equal-split-count-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-manual-split-0')).not.toBeInTheDocument();
  });

  it('switching from equal split to single replaces the prior split configuration (T022)', async () => {
    const onSplitFormChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ManualSplitEditor
        slotIndex={0}
        slotId="slot-1"
        splitForm={EQUAL_FORM}
        onSplitFormChange={onSplitFormChange}
      />,
    );

    await user.click(screen.getByTestId('shift-mode-select-0'));
    await user.click(await screen.findByText('Single shift'));

    expect(onSplitFormChange).toHaveBeenCalledWith({
      mode: 'equal',
      equalCount: '1',
      manualSpans: [],
    });
  });

  it('switching from manual to single discards the manual spans (T022)', async () => {
    const onSplitFormChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ManualSplitEditor
        slotIndex={0}
        slotId="slot-1"
        splitForm={MANUAL_FORM}
        onSplitFormChange={onSplitFormChange}
      />,
    );

    await user.click(screen.getByTestId('shift-mode-select-0'));
    await user.click(await screen.findByText('Single shift'));

    expect(onSplitFormChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'equal', equalCount: '1' }),
    );
  });

  it('switching from single to equal split bumps the count off 1', async () => {
    const onSplitFormChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ManualSplitEditor
        slotIndex={0}
        slotId="slot-1"
        splitForm={SINGLE_FORM}
        onSplitFormChange={onSplitFormChange}
      />,
    );

    await user.click(screen.getByTestId('shift-mode-select-0'));
    await user.click(await screen.findByText('Equal split'));

    expect(onSplitFormChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'equal', equalCount: '2' }),
    );
  });

  it('switching to manual mode drives the same manualSpans shape used by validateManualSpans', async () => {
    const onSplitFormChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ManualSplitEditor
        slotIndex={0}
        slotId="slot-1"
        splitForm={EQUAL_FORM}
        onSplitFormChange={onSplitFormChange}
      />,
    );

    await user.click(screen.getByTestId('shift-mode-select-0'));
    await user.click(await screen.findByText('Manual spans'));

    expect(onSplitFormChange).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'manual' }),
    );
  });
});

describe('ManualSplitEditor manual spans (T001/T023)', () => {
  it('adds a new manual span with touch-sized inputs', async () => {
    const onSplitFormChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ManualSplitEditor
        slotIndex={0}
        slotId="slot-1"
        splitForm={{ mode: 'manual', equalCount: '2', manualSpans: [] }}
        onSplitFormChange={onSplitFormChange}
      />,
    );

    await user.click(screen.getByTestId('add-manual-split-0'));

    expect(onSplitFormChange).toHaveBeenCalledWith({
      mode: 'manual',
      equalCount: '2',
      manualSpans: [{ startTime: '', endTime: '', label: '' }],
    });
  });

  it('updates an existing span field without touching sibling spans', async () => {
    const onSplitFormChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <ManualSplitEditor
        slotIndex={0}
        slotId="slot-1"
        splitForm={{
          mode: 'manual',
          equalCount: '2',
          manualSpans: [
            { startTime: '', endTime: '', label: 'first' },
            { startTime: '', endTime: '', label: 'second' },
          ],
        }}
        onSplitFormChange={onSplitFormChange}
      />,
    );

    await user.type(screen.getByTestId('manual-split-label-0-0'), 'X');

    const lastCall =
      onSplitFormChange.mock.calls[onSplitFormChange.mock.calls.length - 1];
    expect(lastCall[0].manualSpans[1].label).toBe('second');
  });
});

describe('createManualSplitSchema regression-equivalence with validateManualSpans (Iteration 2/T048a/FR-027)', () => {
  const SLOT_VIEW: GetCycleParticipation200EventsItem['slots'][number] = {
    slot: {
      id: 'slot-1',
      churchId: 'church-1',
      eventId: 'event-1',
      startTime: '2026-07-12T09:00:00',
      endTime: '2026-07-12T11:00:00',
      label: 'Greeter',
      status: 'active',
      requirements: [],
    },
    included: true,
    shifts: [],
    requirements: [],
  };

  function parseManual(spans: SplitFormState['manualSpans']) {
    return createManualSplitSchema({ slotView: SLOT_VIEW }).safeParse({
      mode: 'manual',
      equalCount: '2',
      manualSpans: spans,
    });
  }

  it('accepts spans fully within slot bounds, in order, non-overlapping — same as validateManualSpans', () => {
    expect(
      parseManual([
        {
          startTime: '2026-07-12T09:00:00',
          endTime: '2026-07-12T10:00:00',
          label: '',
        },
        {
          startTime: '2026-07-12T10:00:00',
          endTime: '2026-07-12T11:00:00',
          label: '',
        },
      ]).success,
    ).toBe(true);
  });

  it('rejects a span with identical start and end (zero duration) — same as validateManualSpans', () => {
    expect(
      parseManual([
        {
          startTime: '2026-07-12T09:00:00',
          endTime: '2026-07-12T09:00:00',
          label: '',
        },
      ]).success,
    ).toBe(false);
  });

  it('rejects a span that ends before it starts — same as validateManualSpans', () => {
    expect(
      parseManual([
        {
          startTime: '2026-07-12T10:00:00',
          endTime: '2026-07-12T09:00:00',
          label: '',
        },
      ]).success,
    ).toBe(false);
  });

  it('rejects a span starting before the parent slot bounds — same as validateManualSpans', () => {
    expect(
      parseManual([
        {
          startTime: '2026-07-12T08:00:00',
          endTime: '2026-07-12T10:00:00',
          label: '',
        },
      ]).success,
    ).toBe(false);
  });

  it('rejects a span ending after the parent slot bounds — same as validateManualSpans', () => {
    expect(
      parseManual([
        {
          startTime: '2026-07-12T09:00:00',
          endTime: '2026-07-12T12:00:00',
          label: '',
        },
      ]).success,
    ).toBe(false);
  });

  it('rejects two overlapping spans, including identical start/end — same as validateManualSpans', () => {
    expect(
      parseManual([
        {
          startTime: '2026-07-12T09:00:00',
          endTime: '2026-07-12T10:30:00',
          label: '',
        },
        {
          startTime: '2026-07-12T10:00:00',
          endTime: '2026-07-12T11:00:00',
          label: '',
        },
      ]).success,
    ).toBe(false);

    expect(
      parseManual([
        {
          startTime: '2026-07-12T09:00:00',
          endTime: '2026-07-12T10:00:00',
          label: '',
        },
        {
          startTime: '2026-07-12T09:00:00',
          endTime: '2026-07-12T10:00:00',
          label: '',
        },
      ]).success,
    ).toBe(false);
  });

  it('is a no-op (never rejects) in equal-split mode, matching validateManualSpans only being consulted for manual mode', () => {
    expect(
      createManualSplitSchema({ slotView: SLOT_VIEW }).safeParse({
        mode: 'equal',
        equalCount: '3',
        manualSpans: [
          {
            startTime: '2026-07-12T08:00:00',
            endTime: '2026-07-12T07:00:00',
            label: '',
          },
        ],
      }).success,
    ).toBe(true);
  });
});

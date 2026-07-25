import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type {
  CycleCountsSummary,
  CycleStaffingSummary,
} from '../../utils/builder/cycle-builder-staffing.utils';
import {
  CycleBuilderHeader,
  formatCycleDateRange,
} from './cycle-builder-header';

const staffing: CycleStaffingSummary = {
  filled: 42,
  required: 48,
  percent: 88,
  shiftsBelowTarget: 6,
};

const counts: CycleCountsSummary = {
  eventCount: 5,
  slotCount: 5,
  shiftCount: 8,
  assignedCount: 42,
};

describe('formatCycleDateRange (B-4)', () => {
  it('reads a cycle window as dates, not instants', () => {
    expect(
      formatCycleDateRange({
        startDate: '2026-08-01',
        endDate: '2026-08-31',
      }),
    ).toBe('Aug 1 – Aug 31, 2026');
  });

  it('says nothing when either boundary is missing', () => {
    expect(formatCycleDateRange({ startDate: '2026-08-01' })).toBeUndefined();
    expect(formatCycleDateRange({})).toBeUndefined();
  });
});

describe('CycleBuilderHeader (B-4)', () => {
  it('titles the board with the cycle it is building, not a slogan', () => {
    render(
      <CycleBuilderHeader
        cycleName="Julho 2026"
        cycleStartDate="2026-07-01"
        cycleEndDate="2026-07-31"
        staffing={staffing}
        counts={counts}
      />,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Julho 2026',
    );
    expect(screen.getByText('Jul 1 – Jul 31, 2026')).toBeVisible();
    // The banned tiny colored eyebrow and the landing-page promise are gone.
    expect(
      screen.queryByText(/Map the cycle, then place with confidence/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Cycle board')).not.toBeInTheDocument();
  });

  it('falls back to a plain description when the cycle has no dates set', () => {
    render(
      <CycleBuilderHeader
        cycleName="Julho 2026"
        staffing={staffing}
        counts={counts}
      />,
    );

    expect(screen.getByText('No dates set for this cycle yet.')).toBeVisible();
  });

  it('carries the session progress signal and what is still open', () => {
    render(
      <CycleBuilderHeader
        cycleName="Julho 2026"
        staffing={staffing}
        counts={counts}
      />,
    );

    const progress = screen.getByTestId('cycle-builder-progress');
    expect(progress).toHaveTextContent('42 of 48 assignments filled');
    expect(progress).toHaveTextContent('88%');
    expect(progress).toHaveTextContent('6 shifts are below target');
  });

  it('singularises the one-shift case and reports a finished cycle', () => {
    const { rerender } = render(
      <CycleBuilderHeader
        staffing={{ ...staffing, shiftsBelowTarget: 1 }}
        counts={counts}
      />,
    );

    expect(screen.getByTestId('cycle-builder-progress')).toHaveTextContent(
      '1 shift is below target',
    );

    rerender(
      <CycleBuilderHeader
        staffing={{
          filled: 48,
          required: 48,
          percent: 100,
          shiftsBelowTarget: 0,
        }}
        counts={counts}
      />,
    );

    expect(screen.getByTestId('cycle-builder-progress')).toHaveTextContent(
      'Every included shift is at target',
    );
  });

  it('does not render a percentage for a cycle that asks for nobody', () => {
    render(
      <CycleBuilderHeader
        staffing={{ filled: 0, required: 0, percent: 0, shiftsBelowTarget: 0 }}
        counts={{
          eventCount: 0,
          slotCount: 0,
          shiftCount: 0,
          assignedCount: 0,
        }}
      />,
    );

    const progress = screen.getByTestId('cycle-builder-progress');
    expect(progress).toHaveTextContent('No staffing required yet');
    expect(progress).not.toHaveTextContent('0%');
  });

  it('gives the background refetch a home next to the progress it rewrites', () => {
    render(
      <CycleBuilderHeader
        staffing={staffing}
        counts={counts}
        syncedAt={Date.now()}
      />,
    );

    expect(screen.getByTestId('cycle-builder-synced-at')).toHaveTextContent(
      'Synced just now',
    );
  });

  it('surfaces the cycle inventory counters alongside the staffing signal', () => {
    render(
      <CycleBuilderHeader
        cycleName="Julho 2026"
        staffing={staffing}
        counts={counts}
      />,
    );

    expect(screen.getByTestId('cycle-builder-event-count')).toHaveTextContent(
      '5',
    );
    expect(screen.getByTestId('cycle-builder-slot-count')).toHaveTextContent(
      '5',
    );
    expect(screen.getByTestId('cycle-builder-shift-count')).toHaveTextContent(
      '8',
    );
    expect(
      screen.getByTestId('cycle-builder-assigned-count'),
    ).toHaveTextContent('42');
  });
});

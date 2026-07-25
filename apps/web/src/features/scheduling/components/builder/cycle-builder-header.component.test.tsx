import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  CycleBuilderHeader,
  formatCycleDateRange,
} from './cycle-builder-header';
import type { CycleStaffingSummary } from './cycle-builder-matrix.utils';

const staffing: CycleStaffingSummary = {
  filled: 42,
  required: 48,
  percent: 88,
  shiftsBelowTarget: 6,
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
        actions={null}
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

  it('carries the session progress signal and what is still open', () => {
    render(
      <CycleBuilderHeader
        cycleName="Julho 2026"
        staffing={staffing}
        actions={null}
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
        actions={null}
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
        actions={null}
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
        actions={null}
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
        syncedAt={Date.now()}
        actions={<button type="button">Publish cycle</button>}
      />,
    );

    expect(screen.getByTestId('cycle-builder-synced-at')).toHaveTextContent(
      'Synced just now',
    );
    expect(screen.getByRole('button', { name: 'Publish cycle' })).toBeVisible();
  });
});

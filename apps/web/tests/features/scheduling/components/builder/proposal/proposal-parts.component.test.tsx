import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LoadOrdinal } from '@/features/scheduling/components/builder/proposal/proposal-parts';

beforeEach(() => overwriteGetLocale(() => 'en'));

describe('LoadOrdinal', () => {
  const thresholds = { heavyLoad: 7, severeLoad: 10 };

  it('stays muted before the heavy-load line', () => {
    render(<LoadOrdinal ordinal={3} total={14} {...thresholds} />);
    const label = screen.getByText(
      m.builder_proposal_load_ordinal_label({ ordinal: 3, total: 14 }),
    );
    expect(label.parentElement).toHaveClass('text-muted-foreground');
    expect(document.querySelector('svg')).toBeNull();
  });

  it('turns amber from the line and strong for the clear outlier', () => {
    const { rerender } = render(
      <LoadOrdinal ordinal={7} total={8} {...thresholds} />,
    );
    expect(document.querySelector('svg')).toBeNull();
    expect(
      screen.getByText(
        m.builder_proposal_load_ordinal({ ordinal: 7, total: 8 }),
      ).parentElement,
    ).toHaveClass('text-amber-800');

    rerender(<LoadOrdinal ordinal={9} total={14} {...thresholds} />);
    expect(document.querySelector('svg')).not.toBeNull();
    expect(
      screen.getByText(
        m.builder_proposal_load_ordinal({ ordinal: 9, total: 14 }),
      ).parentElement,
    ).toHaveClass('font-semibold');
  });
});

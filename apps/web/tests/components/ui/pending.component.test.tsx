import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PENDING_DELAY_MS, Pending } from '@/components/ui/pending';

describe('Pending', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders no skeleton before the delay and the skeleton after it', () => {
    render(
      <Pending data-testid="region">
        <span>skeleton</span>
      </Pending>,
    );

    act(() => {
      vi.advanceTimersByTime(PENDING_DELAY_MS - 1);
    });
    expect(screen.queryByText('skeleton')).not.toBeInTheDocument();
    expect(screen.getByTestId('region')).toHaveAttribute('aria-busy', 'true');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText('skeleton')).toBeInTheDocument();
  });
});

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyBuilderState } from './empty-builder-state';
import { renderWithProviders } from '@/__tests__/setup/render';

describe('EmptyBuilderState', () => {
  it('frames one full-event slot as common path and split as optional', async () => {
    const user = userEvent.setup();
    const onAddManually = vi.fn();
    const onAutoGenerate = vi.fn();

    renderWithProviders(
      <EmptyBuilderState
        onAddManually={onAddManually}
        onAutoGenerate={onAutoGenerate}
      />,
    );

    expect(screen.getByText(/most services use one slot/i)).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: /use one slot for full event/i }),
    );
    expect(onAddManually).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole('button', { name: /split event into turns/i }),
    );
    expect(onAutoGenerate).toHaveBeenCalledTimes(1);
  });
});

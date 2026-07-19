import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AssignmentPicker } from './assignment-picker';
import { renderWithProviders } from '@/__tests__/setup/render';

describe('AssignmentPicker', () => {
  it('expands contextual details when a volunteer serves in multiple assignments', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AssignmentPicker
        open
        onOpenChange={vi.fn()}
        trigger={<button type="button">Add</button>}
        volunteers={[
          {
            id: 'volunteer-1',
            name: 'Local Volunteer',
            availabilityStatus: 'available',
            alreadyAssignedCount: 2,
            alreadyServingAssignments: [
              {
                summary: 'Thu, Sep 3 · Night · Support',
                detail: 'Sunday Gathering · Thu, Sep 3 · Night · Support',
              },
              {
                summary: 'Sun, Sep 6 · Morning · Coordinator',
                detail: 'Sunday Gathering · Sun, Sep 6 · Morning · Coordinator',
              },
            ],
          },
        ]}
        onSelect={vi.fn()}
      />,
    );

    await user.click(screen.getByText('Serving in 2 other assignments'));

    expect(
      screen.getByText('Sunday Gathering · Thu, Sep 3 · Night · Support'),
    ).toBeVisible();
    expect(
      screen.getByText('Sunday Gathering · Sun, Sep 6 · Morning · Coordinator'),
    ).toBeVisible();
  });
});

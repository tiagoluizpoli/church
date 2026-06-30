import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../setup/render';
import { AvailabilityForm } from '@/features/volunteers/components/availability-form';

const eventFixture = {
  id: 'event-1',
  title: 'Youth Gathering',
  eventType: 'hourly' as const,
  startDate: '2099-01-05T09:00:00.000Z',
  endDate: '2099-01-05T11:00:00.000Z',
};

describe('AvailabilityForm', () => {
  it('saves the selected slot answers', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    renderWithProviders(
      <AvailabilityForm
        event={eventFixture}
        slots={[
          {
            slotId: 'slot-1',
            label: '8:00 AM Service',
            startTime: '2099-01-05T08:00:00.000Z',
            endTime: '2099-01-05T09:30:00.000Z',
          },
          {
            slotId: 'slot-2',
            label: '10:30 AM Service',
            startTime: '2099-01-05T10:30:00.000Z',
            endTime: '2099-01-05T12:00:00.000Z',
          },
        ]}
        isEditable={true}
        isOnline={true}
        onSave={onSave}
        saveState="idle"
      />,
    );

    const availableButtons = screen.getAllByRole('button', {
      name: 'I can serve',
    });
    const unavailableButtons = screen.getAllByRole('button', {
      name: 'I cannot serve',
    });

    const firstAvailableButton = availableButtons[0];
    const secondUnavailableButton = unavailableButtons[1];

    expect(firstAvailableButton).toBeDefined();
    expect(secondUnavailableButton).toBeDefined();

    if (!firstAvailableButton || !secondUnavailableButton) {
      throw new Error('Expected both slot response buttons to exist');
    }

    await user.click(firstAvailableButton);
    await user.click(secondUnavailableButton);
    await user.click(screen.getByRole('button', { name: 'Save availability' }));

    expect(onSave).toHaveBeenCalledWith({
      answers: [
        {
          slotId: 'slot-1',
          response: 'available',
        },
        {
          slotId: 'slot-2',
          response: 'unavailable',
        },
      ],
    });
  });

  it('blocks save while offline', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    renderWithProviders(
      <AvailabilityForm
        event={eventFixture}
        slots={[
          {
            slotId: 'slot-1',
            label: '8:00 AM Service',
            startTime: '2099-01-05T08:00:00.000Z',
            endTime: '2099-01-05T09:30:00.000Z',
            response: 'available',
          },
        ]}
        isEditable={true}
        isOnline={false}
        onSave={onSave}
        saveState="idle"
      />,
    );

    expect(screen.getByText('Offline')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save availability' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'Availability changes stay blocked until your connection returns.',
      ),
    ).toBeInTheDocument();
  });
});

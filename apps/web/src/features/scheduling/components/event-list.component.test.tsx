import { screen } from '@testing-library/react';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EventList } from './event-list';
import { renderWithProviders } from '@/__tests__/setup/render';

const listMinistries = vi.fn();
const listEvents = vi.fn();

vi.mock('@/utils/api-instances', () => ({
  adminApi: {
    listMinistries: (...args: unknown[]) => listMinistries(...args),
    listEvents: (...args: unknown[]) => listEvents(...args),
  },
}));

interface MockLinkProps {
  children: React.ReactNode;
  to: string;
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: MockLinkProps) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('./quick-create-event-modal', () => ({
  QuickCreateEventModal: () => null,
}));

function render() {
  return renderWithProviders(<EventList />);
}

describe('EventList hardening', () => {
  it('renders a clear scope error when ministries cannot be loaded', async () => {
    listMinistries.mockRejectedValue(new Error('Failed to load ministries'));

    render();

    const errorState = await screen.findByTestId('builder-events-scope-error');
    expect(errorState).toBeVisible();
    expect(errorState).toHaveTextContent('Unable to load ministries');
    expect(errorState).toHaveTextContent('Failed to load ministries');
  });

  it('renders a clear events error when the event list fails to load', async () => {
    listMinistries.mockResolvedValue({
      ministries: [{ id: 'ministry-1', name: 'Worship' }],
    });
    listEvents.mockRejectedValue(new Error('Failed to load builder events'));

    render();

    const errorState = await screen.findByTestId('builder-events-error-state');
    expect(errorState).toBeVisible();
    expect(errorState).toHaveTextContent('Unable to load builder events');
    expect(errorState).toHaveTextContent('Failed to load builder events');
  });

  it('renders an empty scope state when no ministries are available', async () => {
    listMinistries.mockResolvedValue({ ministries: [] });

    render();

    expect(await screen.findByText('No ministries yet')).toBeVisible();
    expect(
      screen.getByText(
        'Create or join a ministry before opening builder-ready events.',
      ),
    ).toBeVisible();
  });
});

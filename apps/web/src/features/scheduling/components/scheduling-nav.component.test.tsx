import { screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SchedulingNav } from './scheduling-nav';
import { renderWithProviders } from '@/__tests__/setup/render';

let mockPathname = '/scheduling/planning';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ({ pathname: mockPathname }),
}));

describe('SchedulingNav', () => {
  it('orders the tabs by the scheduling workflow', () => {
    mockPathname = '/scheduling/planning';
    renderWithProviders(<SchedulingNav />);

    const nav = screen.getByRole('navigation', { name: 'Scheduling views' });
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent?.trim());

    expect(labels).toEqual(['Planning', 'Tailoring', 'Builder events']);
  });

  it('activates only the matching tab on planning routes', () => {
    mockPathname = '/scheduling/planning';
    renderWithProviders(<SchedulingNav />);

    const links = within(
      screen.getByRole('navigation', { name: 'Scheduling views' }),
    ).getAllByRole('link');

    expect(links[0]).toHaveAttribute('data-active', 'true');
    expect(links[1]).toHaveAttribute('data-active', 'false');
    expect(links[2]).toHaveAttribute('data-active', 'false');
  });

  it('treats rostering as part of the tailoring flow', () => {
    mockPathname = '/scheduling/rostering/cycle-1/ministry-1/participation-1';
    renderWithProviders(<SchedulingNav />);

    const links = within(
      screen.getByRole('navigation', { name: 'Scheduling views' }),
    ).getAllByRole('link');

    expect(links[0]).toHaveAttribute('data-active', 'false');
    expect(links[1]).toHaveAttribute('data-active', 'true');
    expect(links[2]).toHaveAttribute('data-active', 'false');
  });

  it('keeps builder events active for builder subpages only', () => {
    mockPathname = '/scheduling/events/event-1/builder';
    renderWithProviders(<SchedulingNav />);

    const links = within(
      screen.getByRole('navigation', { name: 'Scheduling views' }),
    ).getAllByRole('link');

    expect(links[0]).toHaveAttribute('data-active', 'false');
    expect(links[1]).toHaveAttribute('data-active', 'false');
    expect(links[2]).toHaveAttribute('data-active', 'true');
  });
});

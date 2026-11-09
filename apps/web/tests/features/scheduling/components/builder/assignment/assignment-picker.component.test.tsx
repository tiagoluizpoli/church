import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssignmentPicker } from '@/features/scheduling/components/builder/assignment/assignment-picker';
import { renderWithProviders } from '@/tests/setup/render';

describe('AssignmentPicker', () => {
  afterEach(() => overwriteGetLocale(() => 'en'));

  it.each([
    ['en', ['Available', "Hasn't answered", 'Not asked', 'Unavailable']],
    [
      'pt-BR',
      ['Disponível', 'Ainda não respondeu', 'Não consultado', 'Indisponível'],
    ],
  ] as const)('renders each state in %s', (locale, labels) => {
    overwriteGetLocale(() => locale);
    renderWithProviders(
      <AssignmentPicker
        open
        onOpenChange={vi.fn()}
        trigger={<button type="button">Add</button>}
        volunteers={[
          {
            id: 'a',
            name: 'Ana',
            availabilityStatus: 'available',
            alreadyAssignedCount: 0,
          },
          {
            id: 'b',
            name: 'Bea',
            availabilityStatus: 'unanswered',
            alreadyAssignedCount: 0,
          },
          {
            id: 'c',
            name: 'Cleo',
            availabilityStatus: 'not_asked',
            alreadyAssignedCount: 0,
          },
          {
            id: 'd',
            name: 'Dana',
            availabilityStatus: 'unavailable',
            alreadyAssignedCount: 0,
          },
        ]}
        onSelect={vi.fn()}
      />,
    );
    for (const label of labels)
      expect(screen.getByText(label)).toBeInTheDocument();
  });
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

  it('keeps suggestion states in ranked order', () => {
    renderWithProviders(
      <AssignmentPicker
        open
        onOpenChange={vi.fn()}
        trigger={<button type="button">Add</button>}
        volunteers={[
          {
            id: 'd',
            name: 'Dana',
            availabilityStatus: 'unavailable',
            alreadyAssignedCount: 0,
          },
          {
            id: 'c',
            name: 'Cleo',
            availabilityStatus: 'not_asked',
            alreadyAssignedCount: 0,
          },
          {
            id: 'b',
            name: 'Bea',
            availabilityStatus: 'unanswered',
            alreadyAssignedCount: 0,
          },
          {
            id: 'a',
            name: 'Ana',
            availabilityStatus: 'available',
            alreadyAssignedCount: 0,
          },
        ]}
        suggestions={{
          safe: [
            { id: 'a', name: 'Ana', status: 'available', workloadCount: 0 },
          ],
          needsResponse: [
            { id: 'd', name: 'Dana', status: 'unavailable', workloadCount: 0 },
            { id: 'c', name: 'Cleo', status: 'not_asked', workloadCount: 0 },
            { id: 'b', name: 'Bea', status: 'unanswered', workloadCount: 0 },
          ],
        }}
        onSelect={vi.fn()}
        onSelectSuggestion={vi.fn()}
      />,
    );
    expect(
      screen
        .getAllByTestId('suggestion-option')
        .map((node) => node.textContent),
    ).toEqual([
      expect.stringContaining('Ana'),
      expect.stringContaining('Bea'),
      expect.stringContaining('Cleo'),
      expect.stringContaining('Dana'),
    ]);
  });

  it('orders the four answer states and refuses a conflicting volunteer', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <AssignmentPicker
        open
        onOpenChange={vi.fn()}
        trigger={<button type="button">Add</button>}
        volunteers={[
          {
            id: 'd',
            name: 'Dana',
            availabilityStatus: 'unavailable',
            alreadyAssignedCount: 0,
          },
          {
            id: 'c',
            name: 'Cleo',
            availabilityStatus: 'not_asked',
            alreadyAssignedCount: 0,
          },
          {
            id: 'b',
            name: 'Bea',
            availabilityStatus: 'unanswered',
            alreadyAssignedCount: 0,
            conflictReason: 'Already serving in Worship 10:00–12:00',
          },
          {
            id: 'a',
            name: 'Ana',
            availabilityStatus: 'available',
            alreadyAssignedCount: 0,
          },
        ]}
        onSelect={onSelect}
      />,
    );
    expect(
      screen
        .getAllByTestId('picker-option-name')
        .map((node) => node.textContent),
    ).toEqual(['Ana', 'Bea', 'Cleo', 'Dana']);
    expect(
      screen.getByText('Already serving in Worship 10:00–12:00'),
    ).toBeInTheDocument();
    const blocked = screen.getByText('Bea').closest('button');
    expect(blocked).toBeDisabled();
    if (blocked) await user.click(blocked);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders the conflict reason in Portuguese and disables the volunteer', () => {
    overwriteGetLocale(() => 'pt-BR');
    const reason = m.builder_conflict_reason({
      ministry: 'Louvor',
      start: '10:00',
      end: '12:00',
    });
    renderWithProviders(
      <AssignmentPicker
        open
        onOpenChange={vi.fn()}
        trigger={<button type="button">Adicionar</button>}
        volunteers={[
          {
            id: 'b',
            name: 'Bea',
            availabilityStatus: 'available',
            alreadyAssignedCount: 0,
            conflictReason: reason,
          },
        ]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText(reason).closest('button')).toBeDisabled();
  });

  it('does not offer an unqualified volunteer', () => {
    renderWithProviders(
      <AssignmentPicker
        open
        onOpenChange={vi.fn()}
        trigger={<button type="button">Add</button>}
        volunteers={[
          {
            id: 'volunteer-1',
            name: 'Unqualified Volunteer',
            availabilityStatus: 'available',
            isQualified: false,
            alreadyAssignedCount: 0,
          },
          {
            id: 'volunteer-2',
            name: 'Qualified Volunteer',
            availabilityStatus: 'unanswered',
            isQualified: true,
            alreadyAssignedCount: 0,
          },
        ]}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByText('Unqualified Volunteer')).not.toBeInTheDocument();
    expect(screen.getByText('Qualified Volunteer')).toBeInTheDocument();
  });
});

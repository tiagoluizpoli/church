import { m } from '@church/i18n/messages';
import { overwriteGetLocale } from '@church/i18n/runtime';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnavailableConfirmDialog } from '@/features/scheduling/components/builder/assignment/unavailable-confirm-dialog';

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  volunteerName: 'John Doe',
  eventTimeBlockLabel: '9:00 AM – 11:00 AM',
  isPending: false,
  onConfirm: vi.fn(),
};

describe('UnavailableConfirmDialog (T104)', () => {
  beforeEach(() => overwriteGetLocale(() => 'en'));
  it('renders the confirmation in Portuguese', () => {
    overwriteGetLocale(() => 'pt-BR');
    try {
      render(
        <UnavailableConfirmDialog
          {...baseProps}
          volunteerMembership={{ ministryAccessLevel: 'leader' }}
        />,
      );
      expect(screen.getByTestId('assignee-role-badge')).toHaveTextContent(
        m.ministry_invitation_access_leader(),
      );
      expect(screen.getByRole('heading')).toHaveTextContent(
        m.builder_unavailable_confirm_title(),
      );
      expect(
        screen.getByText(
          m.builder_unavailable_confirm_description({
            name: 'John Doe',
            shift: baseProps.eventTimeBlockLabel,
          }),
        ),
      ).toBeVisible();
    } finally {
      overwriteGetLocale(() => 'en');
    }
  });

  it('names the volunteer and shift', () => {
    render(<UnavailableConfirmDialog {...baseProps} />);
    expect(screen.getByText(/John Doe.*9:00 AM – 11:00 AM/)).toBeVisible();
  });

  it('asks for no reason and confirms in one click', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<UnavailableConfirmDialog {...baseProps} onConfirm={onConfirm} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', {
        name: m.builder_unavailable_confirm_action(),
      }),
    );
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('shows a pending label while saving', () => {
    render(<UnavailableConfirmDialog {...baseProps} isPending={true} />);
    expect(
      screen.getByRole('button', {
        name: m.builder_unavailable_confirm_saving(),
      }),
    ).toBeInTheDocument();
  });

  it('renders a Leader badge next to the title for a ministry Leader', () => {
    render(
      <UnavailableConfirmDialog
        {...baseProps}
        volunteerName="Local Leader"
        volunteerMembership={{ ministryAccessLevel: 'leader' }}
      />,
    );
    expect(screen.getByTestId('assignee-role-badge')).toHaveTextContent(
      'Leader',
    );
  });

  it('renders no role badge for a plain volunteer', () => {
    render(
      <UnavailableConfirmDialog
        {...baseProps}
        volunteerMembership={{
          ministryAccessLevel: 'volunteer',
        }}
      />,
    );
    expect(screen.queryByTestId('assignee-role-badge')).not.toBeInTheDocument();
  });
});

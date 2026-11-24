import { m } from '@church/i18n/messages';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';

describe('Dialog shared defaults', () => {
  it('names the corner and footer close controls from the catalog', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>,
    );

    expect(
      screen.getAllByRole('button', { name: m.shell_close() }),
    ).toHaveLength(2);
  });
});

describe('Dialog focus trap', () => {
  /** Opens with two buttons, once base-ui's own initial focus (on the first) has landed. */
  async function renderButtons() {
    render(
      <Dialog open>
        <DialogContent>
          <button type="button">Primeiro</button>
          <button type="button">Segundo</button>
        </DialogContent>
      </Dialog>,
    );
    const first = screen.getByRole('button', { name: 'Primeiro' });
    await waitFor(() => expect(first).toHaveFocus());
    return {
      first,
      close: screen.getByRole('button', { name: m.shell_close() }),
    };
  }

  it('wraps Tab from the last control straight to the first, never through a focus guard', async () => {
    const user = userEvent.setup();
    const { first, close } = await renderButtons();
    close.focus();

    await user.tab();

    expect(first).toHaveFocus();
  });

  it('wraps Shift+Tab from the first control straight to the last', async () => {
    const user = userEvent.setup();
    const { first, close } = await renderButtons();
    first.focus();

    await user.tab({ shift: true });

    expect(close).toHaveFocus();
  });
});

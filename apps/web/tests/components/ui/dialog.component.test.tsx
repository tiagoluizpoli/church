import { m } from '@church/i18n/messages';
import { render, screen } from '@testing-library/react';
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

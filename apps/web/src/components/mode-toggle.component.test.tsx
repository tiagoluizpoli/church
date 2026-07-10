import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MobileDrawer } from './mobile-drawer';
import { ModeToggle } from './mode-toggle';
import { ThemeProvider } from './theme-provider';

function renderNestedInOpenDrawer() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="light">
      <MobileDrawer
        open
        onOpenChange={() => {}}
        title="Navigation"
        description="Move between your core workflows."
      >
        <ModeToggle />
      </MobileDrawer>
    </ThemeProvider>,
  );
}

describe('ModeToggle nested inside an open MobileDrawer (US3)', () => {
  it("stacks its dropdown content's z-index above the drawer's overlay/content z-index", async () => {
    renderNestedInOpenDrawer();

    const drawerContent = screen.getByTestId('mobile-drawer-content');
    expect(drawerContent.className).toContain('z-50');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Toggle theme' }));

    const dropdownContent = document.querySelector(
      '[data-slot="dropdown-menu-content"]',
    );
    expect(dropdownContent).not.toBeNull();
    expect(dropdownContent?.className).not.toContain('z-50');
    expect(dropdownContent?.className).toContain('z-60');
  });

  it("lets a click actually land on a menu item (not swallowed by the drawer's pointer-events lock)", async () => {
    renderNestedInOpenDrawer();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Toggle theme' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Dark' }));

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  });
});

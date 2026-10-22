import { m } from '@church/i18n/messages';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { MobileDrawer } from '@/components/mobile-drawer';
import { ModeToggle } from '@/components/mode-toggle';
import { ThemeProvider } from '@/components/theme-provider';

// next-themes persists the selected theme to localStorage — without
// resetting it, a "Dark" selection in one test leaks into the next test's
// ThemeProvider mount (its `defaultTheme` only applies when localStorage is
// empty), which was flipping unrelated dropdown-open timing downstream.
afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

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

describe('ModeToggle standalone (#219, right-sized from theme.spec.ts)', () => {
  it('applies the dark class when Dark is selected, and removes it when Light is selected', async () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="light">
        <ModeToggle />
      </ThemeProvider>,
    );

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: m.mode_toggle_label() }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: m.mode_toggle_dark() }),
    );

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));

    await user.click(
      screen.getByRole('button', { name: m.mode_toggle_label() }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: m.mode_toggle_light() }),
    );

    await waitFor(() =>
      expect(document.documentElement).not.toHaveClass('dark'),
    );
  });

  it('selecting System closes the menu without throwing', async () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="light">
        <ModeToggle />
      </ThemeProvider>,
    );

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: m.mode_toggle_label() }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: m.mode_toggle_system() }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('menuitem', { name: m.mode_toggle_system() }),
      ).not.toBeInTheDocument(),
    );
  });
});

describe('ModeToggle nested inside an open MobileDrawer (US3)', () => {
  it("stacks its dropdown content's z-index above the drawer's overlay/content z-index", async () => {
    renderNestedInOpenDrawer();

    const drawerContent = screen.getByTestId('mobile-drawer-content');
    expect(drawerContent.className).toContain('z-50');

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: m.mode_toggle_label() }),
    );

    const dropdownContent = await waitFor(() => {
      const el = document.querySelector('[data-slot="dropdown-menu-content"]');
      if (!el) throw new Error('dropdown content not mounted yet');
      return el;
    });
    expect(dropdownContent.className).not.toContain('z-50');
    expect(dropdownContent.className).toContain('z-60');
  });

  it("lets a click actually land on a menu item (not swallowed by the drawer's pointer-events lock)", async () => {
    renderNestedInOpenDrawer();

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: m.mode_toggle_label() }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: m.mode_toggle_dark() }),
    );

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  });
});

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResponsiveFormSurface } from './responsive-form-surface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const mockUseMediaQuery = vi.fn();

vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: (query: string) => mockUseMediaQuery(query),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('ResponsiveFormSurface', () => {
  it('renders the Dialog shell at a mocked desktop viewport', () => {
    mockUseMediaQuery.mockReturnValue(true);

    render(
      <ResponsiveFormSurface open onOpenChange={() => {}} title="New Event">
        <div data-testid="surface-children">Form body</div>
      </ResponsiveFormSurface>,
    );

    expect(
      document.querySelector('[data-slot="dialog-content"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="drawer-popup"]'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('New Event')).toBeInTheDocument();
    expect(screen.getByTestId('surface-children')).toBeInTheDocument();
  });

  it('renders the Drawer shell at a mocked mobile viewport with identical children', () => {
    mockUseMediaQuery.mockReturnValue(false);

    render(
      <ResponsiveFormSurface open onOpenChange={() => {}} title="New Event">
        <div data-testid="surface-children">Form body</div>
      </ResponsiveFormSurface>,
    );

    expect(
      document.querySelector('[data-slot="drawer-popup"]'),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="dialog-content"]'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('New Event')).toBeInTheDocument();
    expect(screen.getByTestId('surface-children')).toBeInTheDocument();
  });

  it('renders the footer prop via DialogFooter on desktop, and via DrawerFooter outside the scroll region on mobile', () => {
    mockUseMediaQuery.mockReturnValue(true);

    const { unmount } = render(
      <ResponsiveFormSurface
        open
        onOpenChange={() => {}}
        title="New Event"
        footer={<Button>Save</Button>}
      >
        <div>Form body</div>
      </ResponsiveFormSurface>,
    );

    expect(
      document.querySelector('[data-slot="dialog-footer"]'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    unmount();

    mockUseMediaQuery.mockReturnValue(false);

    render(
      <ResponsiveFormSurface
        open
        onOpenChange={() => {}}
        title="New Event"
        footer={<Button>Save</Button>}
      >
        <div>Form body</div>
      </ResponsiveFormSurface>,
    );

    const footer = document.querySelector('[data-slot="drawer-footer"]');
    const scrollRegion = document.querySelector('.overflow-auto');
    expect(footer).toBeInTheDocument();
    expect(scrollRegion?.contains(footer)).toBe(false);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('bumps descendant Input/Button controls to the 44px touch size only on the Drawer (mobile) branch', () => {
    mockUseMediaQuery.mockReturnValue(true);

    const { unmount } = render(
      <ResponsiveFormSurface open onOpenChange={() => {}} title="New Event">
        <Input aria-label="Title" />
        <Button>Save</Button>
      </ResponsiveFormSurface>,
    );

    expect(screen.getByLabelText('Title').className).not.toContain('h-11');
    expect(
      screen.getByRole('button', { name: 'Save' }).className,
    ).not.toContain('h-11');
    unmount();

    mockUseMediaQuery.mockReturnValue(false);

    render(
      <ResponsiveFormSurface open onOpenChange={() => {}} title="New Event">
        <Input aria-label="Title" />
        <Button>Save</Button>
      </ResponsiveFormSurface>,
    );

    expect(screen.getByLabelText('Title').className).toContain('h-11');
    expect(screen.getByRole('button', { name: 'Save' }).className).toContain(
      'h-11',
    );
  });

  it('bumps footer-prop buttons to the 44px touch size on the Drawer (mobile) branch too', () => {
    mockUseMediaQuery.mockReturnValue(false);

    render(
      <ResponsiveFormSurface
        open
        onOpenChange={() => {}}
        title="New Event"
        footer={<Button>Save</Button>}
      >
        <div>Form body</div>
      </ResponsiveFormSurface>,
    );

    expect(screen.getByRole('button', { name: 'Save' }).className).toContain(
      'h-11',
    );
  });
});

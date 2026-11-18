import { m } from '@church/i18n/messages';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Breadcrumb, BreadcrumbEllipsis } from '@/components/ui/breadcrumb';

describe('Breadcrumb shared defaults', () => {
  it('names the landmark and the ellipsis from the catalog', () => {
    render(
      <Breadcrumb>
        <BreadcrumbEllipsis />
      </Breadcrumb>,
    );

    expect(
      screen.getByRole('navigation', { name: m.shell_breadcrumb() }),
    ).toBeVisible();
    expect(screen.getByText(m.shell_more())).toBeInTheDocument();
  });
});

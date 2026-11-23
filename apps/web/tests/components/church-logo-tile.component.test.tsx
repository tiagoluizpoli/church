import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChurchLogoTile } from '@/components/church-logo-tile';

describe('ChurchLogoTile', () => {
  it("shows the Church's logo, named by the Church, contained and never cropped", () => {
    render(
      <ChurchLogoTile
        name="Igreja Semente"
        logoUrl="https://files.test/logo.png"
        size="desktop"
      />,
    );

    const logo = screen.getByRole('img', { name: 'Igreja Semente' });
    expect(logo).toHaveAttribute('src', 'https://files.test/logo.png');
    expect(logo).toHaveClass('object-contain', 'size-full');
  });

  it('falls back to the platform logo on the same tile when the Church has none', () => {
    render(
      <ChurchLogoTile name="Igreja Semente" logoUrl={null} size="mobile" />,
    );

    // Named by the Church even on the fallback: the collapsed sidebar shows no name beside it.
    const logo = screen.getByRole('img', { name: 'Igreja Semente' });
    expect(logo).toHaveAttribute('src', '/logo.png');
    expect(logo).toHaveClass('object-contain');
    expect(logo?.closest('[data-testid="church-logo-tile"]')).not.toBeNull();
  });

  it('paints a near-white tile with a hairline border in both themes', () => {
    render(<ChurchLogoTile name="Igreja" logoUrl={null} size="desktop" />);

    expect(screen.getByTestId('church-logo-tile')).toHaveClass(
      'bg-white',
      'border',
      'rounded-md',
    );
  });

  it('is always a 4:3 box, so a logo of any shape is letterboxed inside it', () => {
    render(
      <ChurchLogoTile
        name="Igreja Semente"
        logoUrl="https://files.test/strip-4x1.png"
        size="desktop"
      />,
    );

    const tile = screen.getByTestId('church-logo-tile');
    expect(tile).toHaveClass('aspect-[4/3]', 'h-10');
    const logo = screen.getByRole('img', { name: 'Igreja Semente' });
    expect(logo).toHaveClass('size-full', 'object-contain');
    expect(logo.className).not.toMatch(/max-w|w-auto/);
  });

  it('keeps the 4:3 shape in the collapsed sidebar, just smaller', () => {
    render(<ChurchLogoTile name="Igreja" logoUrl={null} size="collapsed" />);

    expect(screen.getByTestId('church-logo-tile')).toHaveClass(
      'aspect-[4/3]',
      'h-9',
    );
  });
});

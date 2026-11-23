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
    expect(logo).toHaveClass('object-contain', 'h-8', 'w-auto');
  });

  it('falls back to the platform logo on the same tile when the Church has none', () => {
    render(
      <ChurchLogoTile name="Igreja Semente" logoUrl={null} size="mobile" />,
    );

    // Named by the Church even on the fallback: the collapsed sidebar shows no name beside it.
    const logo = screen.getByRole('img', { name: 'Igreja Semente' });
    expect(logo).toHaveAttribute('src', '/logo.png');
    expect(logo).toHaveClass('object-contain', 'h-7');
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

  it('fits a wide logo inside the collapsed sidebar instead of cropping it', () => {
    render(
      <ChurchLogoTile
        name="Igreja Semente"
        logoUrl="https://files.test/wide.png"
        size="collapsed"
      />,
    );

    const logo = screen.getByRole('img', { name: 'Igreja Semente' });
    expect(logo).toHaveClass('object-contain', 'h-8', 'max-w-9');
    expect(logo).not.toHaveClass('max-w-32');
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChurchLogoTile } from '@/components/church-logo-tile';

const URL = 'https://files.test/logo.png';

describe('ChurchLogoTile', () => {
  it("shows the Church's logo named by the Church, filling its frame", () => {
    render(
      <ChurchLogoTile name="Igreja Semente" logoUrl={URL} size="desktop" />,
    );

    const logo = screen.getByRole('img', { name: 'Igreja Semente' });
    expect(logo).toHaveAttribute('src', URL);
    expect(logo).toHaveClass('object-cover');
    expect(logo).not.toHaveClass('object-contain');
  });

  it('has no white tile, border or padding, and rounds the image', () => {
    render(<ChurchLogoTile name="Igreja" logoUrl={URL} size="desktop" />);

    const tile = screen.getByTestId('church-logo-tile');
    expect(tile.className).not.toMatch(/bg-white|border|(^|\s)p-\d/);
    expect(tile).toHaveClass('radius-control', 'overflow-hidden');
  });

  it("takes its width from the logo's own aspect, between 1:1 and 4:3 of the height", () => {
    render(<ChurchLogoTile name="Igreja" logoUrl={URL} size="desktop" />);

    expect(screen.getByTestId('church-logo-tile')).toHaveClass('h-10');
    expect(screen.getByRole('img', { name: 'Igreja' })).toHaveClass(
      'w-auto',
      'min-w-10',
      'max-w-[3.33rem]',
    );
    expect(screen.getByTestId('church-logo-tile')).not.toHaveClass(
      'aspect-[4/3]',
    );
  });

  it('is shorter on mobile and in the collapsed sidebar', () => {
    render(<ChurchLogoTile name="Igreja" logoUrl={URL} size="collapsed" />);

    expect(screen.getByTestId('church-logo-tile')).toHaveClass('h-9');
  });

  it("shows the Church's initials on a neutral surface when it has no logo", () => {
    render(
      <ChurchLogoTile name="Igreja Semente" logoUrl={null} size="mobile" />,
    );

    const tile = screen.getByRole('img', { name: 'Igreja Semente' });
    expect(tile).toHaveTextContent('IS');
    expect(tile).toHaveClass('bg-muted', 'aspect-square', 'radius-control');
    expect(screen.queryByRole('img', { name: /logo/i })).toBeNull();
    expect(tile.querySelector('img')).toBeNull();
  });
});

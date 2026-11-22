import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PoweredByFooter } from '@/features/public-church/components/powered-by-footer';

describe('PoweredByFooter', () => {
  it('links the credit to the platform site when it is set', () => {
    render(
      <PoweredByFooter
        appName="Church"
        platformSiteUrl="https://church.example.test"
      />,
    );

    const link = screen.getByRole('link', { name: 'Desenvolvido com Church' });
    expect(link).toHaveAttribute('href', 'https://church.example.test');
    expect(screen.getByRole('contentinfo')).toHaveClass(
      'text-muted-foreground',
    );
  });

  it('shows the credit as plain text without a platform site', () => {
    render(<PoweredByFooter appName="Church" platformSiteUrl={undefined} />);

    expect(screen.getByRole('contentinfo')).toHaveTextContent(
      'Desenvolvido com Church',
    );
    expect(screen.queryByRole('link')).toBeNull();
  });
});

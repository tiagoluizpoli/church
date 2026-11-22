import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PublicContactsSection } from '@/features/public-church/components/public-contacts-section';
import { PublicLegalSection } from '@/features/public-church/components/public-legal-section';
import { renderWithProviders } from '@/tests/setup/render';

const phone = {
  kind: 'phone',
  phoneType: 'mobile',
  value: '+5511999990000',
  description: 'Gabinete',
  isWhatsApp: true,
} as const;
const landline = {
  kind: 'phone',
  phoneType: 'landline',
  value: '+551133334444',
  description: null,
  isWhatsApp: false,
} as const;
const email = {
  kind: 'email',
  phoneType: null,
  value: 'contato@esperanca.test',
  description: null,
  isWhatsApp: false,
} as const;

describe('PublicContactsSection', () => {
  it('hides the section when there is nothing public', () => {
    const { container } = renderWithProviders(
      <PublicContactsSection contactGroups={[]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('groups "Da igreja" first and then each group, in the given order', () => {
    renderWithProviders(
      <PublicContactsSection
        contactGroups={[
          { name: null, contacts: [email], socialLinks: [] },
          { name: 'Pastor João', contacts: [phone], socialLinks: [] },
        ]}
      />,
    );

    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Da igreja',
      'Pastor João',
    ]);
  });

  it('opens the matching app for email, phone and WhatsApp, and marks WhatsApp', () => {
    renderWithProviders(
      <PublicContactsSection
        contactGroups={[
          {
            name: null,
            contacts: [email, landline, phone],
            socialLinks: [],
          },
        ]}
      />,
    );

    expect(
      screen.getByRole('link', { name: /contato@esperanca\.test/ }),
    ).toHaveAttribute('href', 'mailto:contato@esperanca.test');
    expect(screen.getByRole('link', { name: /3333-4444/ })).toHaveAttribute(
      'href',
      'tel:+551133334444',
    );
    const mobile = screen.getByRole('link', { name: /99999-0000/ });
    expect(mobile).toHaveAttribute('href', 'https://wa.me/5511999990000');
    expect(within(mobile).getByText('WhatsApp')).toBeInTheDocument();
    expect(screen.getAllByText('WhatsApp')).toHaveLength(1);
  });

  it('shows Social Links with their network label and description', () => {
    renderWithProviders(
      <PublicContactsSection
        contactGroups={[
          {
            name: null,
            contacts: [],
            socialLinks: [
              {
                url: 'https://youtube.com/@esperanca',
                network: 'youtube',
                description: 'Cultos',
              },
            ],
          },
        ]}
      />,
    );

    const link = screen.getByRole('link', { name: /YouTube/ });
    expect(link).toHaveAttribute('href', 'https://youtube.com/@esperanca');
    expect(link).toHaveTextContent('Cultos');
    expect(link.querySelector('svg')).not.toBeNull();
  });
});

describe('PublicLegalSection', () => {
  it('hides the section when the legal profile is not public', () => {
    const { container } = renderWithProviders(
      <PublicLegalSection legalProfile={null} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the legal name and the formatted CNPJ when public', () => {
    renderWithProviders(
      <PublicLegalSection
        legalProfile={{
          legalName: 'Igreja Batista Esperança LTDA',
          cnpj: '11222333000181',
        }}
      />,
    );

    expect(screen.getByText('Igreja Batista Esperança LTDA')).toBeVisible();
    expect(screen.getByText(/11\.222\.333\/0001-81/)).toBeVisible();
  });
});

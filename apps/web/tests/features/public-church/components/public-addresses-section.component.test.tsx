import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicAddressesSection } from '@/features/public-church/components/public-addresses-section';
import type { GetPublicChurchProfile200AddressesItem } from '@/infrastructure/api/churchAPI.schemas';
import { renderWithProviders } from '@/tests/setup/render';

const SEDE: GetPublicChurchProfile200AddressesItem = {
  label: 'Sede',
  street: 'Rua A',
  number: '120',
  complement: null,
  bairro: 'Centro',
  city: 'Campinas',
  uf: 'SP',
  cep: '13010000',
  latitude: null,
  longitude: null,
  placeId: null,
  isMain: true,
};
const ANEXO: GetPublicChurchProfile200AddressesItem = {
  ...SEDE,
  label: 'Anexo',
  street: 'Rua B',
  number: '5',
  isMain: false,
};
const SEDE_TEXT = 'Rua A, 120, Centro, Campinas - SP, 13010-000';
const KEY = 'embed-key';

function stubUserAgent({ userAgent }: { userAgent: string }) {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PublicAddressesSection', () => {
  it('hides the section when there is no public address', () => {
    const { container } = renderWithProviders(
      <PublicAddressesSection addresses={[]} mapsEmbedKey={KEY} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('embeds the Main Address by address text, then lists the other addresses with their labels', () => {
    renderWithProviders(
      <PublicAddressesSection addresses={[SEDE, ANEXO]} mapsEmbedKey={KEY} />,
    );

    const map = screen.getByTitle('Mapa do endereço principal');
    expect(map).toHaveAttribute(
      'src',
      `https://www.google.com/maps/embed/v1/place?key=${KEY}&q=${encodeURIComponent(SEDE_TEXT)}`,
    );
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining('Sede'),
      expect.stringContaining('Anexo'),
    ]);
  });

  it('embeds by place id when the Main Address has one', () => {
    renderWithProviders(
      <PublicAddressesSection
        addresses={[{ ...SEDE, placeId: 'ChIJabc' }]}
        mapsEmbedKey={KEY}
      />,
    );

    expect(screen.getByTitle('Mapa do endereço principal')).toHaveAttribute(
      'src',
      `https://www.google.com/maps/embed/v1/place?key=${KEY}&q=place_id:ChIJabc`,
    );
  });

  it('shows no map without a key, and the address and links still show', () => {
    renderWithProviders(
      <PublicAddressesSection addresses={[SEDE]} mapsEmbedKey={undefined} />,
    );

    expect(screen.queryByTitle('Mapa do endereço principal')).toBeNull();
    expect(screen.getByText(SEDE_TEXT)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Como chegar' }),
    ).toBeInTheDocument();
  });

  it('opens the navigation link of the visitor device for each address', () => {
    stubUserAgent({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)' });
    renderWithProviders(
      <PublicAddressesSection addresses={[SEDE, ANEXO]} mapsEmbedKey={KEY} />,
    );

    const links = screen.getAllByRole('link', { name: 'Como chegar' });
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `https://maps.apple.com/?daddr=${encodeURIComponent(SEDE_TEXT)}`,
      `https://maps.apple.com/?daddr=${encodeURIComponent('Rua B, 5, Centro, Campinas - SP, 13010-000')}`,
    ]);
  });

  it('uses the Android geo link on Android', () => {
    stubUserAgent({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' });
    renderWithProviders(
      <PublicAddressesSection addresses={[SEDE]} mapsEmbedKey={KEY} />,
    );

    expect(screen.getByRole('link', { name: 'Como chegar' })).toHaveAttribute(
      'href',
      `geo:0,0?q=${encodeURIComponent(SEDE_TEXT)}`,
    );
  });

  it('copies the formatted address', async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined);
    renderWithProviders(
      <PublicAddressesSection addresses={[SEDE]} mapsEmbedKey={KEY} />,
    );

    await user.click(screen.getByRole('button', { name: 'Copiar endereço' }));

    expect(writeText).toHaveBeenCalledWith(SEDE_TEXT);
  });
});

import { describe, expect, it } from 'vitest';
import {
  detectDevice,
  directionsLink,
  formatAddress,
} from '@/features/church-settings/directions';

const address = {
  label: 'Templo',
  street: 'Rua das Flores',
  number: '120',
  complement: 'Sala 2',
  bairro: 'Centro',
  city: 'Campinas',
  uf: 'SP',
  cep: '13010000',
  latitude: null,
  longitude: null,
  placeId: null,
};
const pin = { latitude: -22.9, longitude: -47.06 };
const text = encodeURIComponent(
  'Rua das Flores, 120 – Sala 2, Centro, Campinas - SP, 13010-000',
);

describe('formatAddress', () => {
  it('formats the full address on one line', () => {
    expect(formatAddress({ address })).toBe(
      'Rua das Flores, 120 – Sala 2, Centro, Campinas - SP, 13010-000',
    );
  });

  it('leaves out the number s/n, complement and CEP when absent', () => {
    expect(
      formatAddress({
        address: { ...address, number: 's/n', complement: null, cep: null },
      }),
    ).toBe('Rua das Flores, s/n, Centro, Campinas - SP');
  });
});

describe('directionsLink', () => {
  it('opens the geo chooser on Android, at the pin when there is one', () => {
    expect(
      directionsLink({ address: { ...address, ...pin }, device: 'android' }),
    ).toBe('geo:-22.9,-47.06?q=-22.9,-47.06(Templo)');
  });

  it('falls back to the address text on Android without a pin', () => {
    expect(directionsLink({ address, device: 'android' })).toBe(
      `geo:0,0?q=${text}`,
    );
  });

  it('opens Apple Maps on iPhone, at the pin or the address text', () => {
    expect(
      directionsLink({ address: { ...address, ...pin }, device: 'ios' }),
    ).toBe('https://maps.apple.com/?daddr=-22.9,-47.06');
    expect(directionsLink({ address, device: 'ios' })).toBe(
      `https://maps.apple.com/?daddr=${text}`,
    );
  });

  it('opens Google Maps directions on desktop', () => {
    expect(
      directionsLink({ address: { ...address, ...pin }, device: 'desktop' }),
    ).toBe('https://www.google.com/maps/dir/?api=1&destination=-22.9,-47.06');
    expect(directionsLink({ address, device: 'desktop' })).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${text}`,
    );
  });

  it('adds the destination place id on desktop when known', () => {
    expect(
      directionsLink({
        address: { ...address, ...pin, placeId: 'ChIJabc' },
        device: 'desktop',
      }),
    ).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-22.9,-47.06&destination_place_id=ChIJabc',
    );
  });

  it('labels the Android pin with the address when it has no label', () => {
    expect(
      directionsLink({
        address: { ...address, ...pin, label: null },
        device: 'android',
      }),
    ).toBe(`geo:-22.9,-47.06?q=-22.9,-47.06(${text})`);
  });
});

describe('detectDevice', () => {
  it.each([
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile', 'android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'ios'],
    ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 'ios'],
    ['Mozilla/5.0 (X11; Linux x86_64) Chrome/120', 'desktop'],
  ] as const)('%s → %s', (userAgent, device) => {
    expect(detectDevice({ userAgent })).toBe(device);
  });
});

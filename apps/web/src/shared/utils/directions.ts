export type Device = 'android' | 'ios' | 'desktop';

export interface DirectionsAddress {
  label: string | null;
  street: string;
  number: string;
  complement: string | null;
  bairro: string;
  city: string;
  uf: string;
  cep: string | null;
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
}

interface AddressInput {
  address: DirectionsAddress;
}

/** `Rua A, 120 – Sala 2, Centro, Campinas - SP, 13010-000`, what *Copiar endereço* copies. */
export function formatAddress({ address }: AddressInput): string {
  const complement = address.complement ? ` – ${address.complement}` : '';
  const cep = address.cep ? `, ${address.cep.replace(/^(\d{5})/, '$1-')}` : '';
  return `${address.street}, ${address.number}${complement}, ${address.bairro}, ${address.city} - ${address.uf}${cep}`;
}

interface DirectionsLinkInput extends AddressInput {
  device: Device;
}

/** The navigation link for the device: the pin when there is one, else the address text. */
export function directionsLink({
  address,
  device,
}: DirectionsLinkInput): string {
  const pin =
    address.latitude !== null && address.longitude !== null
      ? `${address.latitude},${address.longitude}`
      : null;
  const text = encodeURIComponent(formatAddress({ address }));
  const target = pin ?? text;

  if (device === 'android') {
    const label = address.label ? encodeURIComponent(address.label) : text;
    return pin ? `geo:${pin}?q=${pin}(${label})` : `geo:0,0?q=${text}`;
  }
  if (device === 'ios') return `https://maps.apple.com/?daddr=${target}`;
  const placeId = address.placeId
    ? `&destination_place_id=${encodeURIComponent(address.placeId)}`
    : '';
  return `https://www.google.com/maps/dir/?api=1&destination=${target}${placeId}`;
}

interface DetectDeviceInput {
  userAgent: string;
}

export function detectDevice({ userAgent }: DetectDeviceInput): Device {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  return 'desktop';
}

import { describe, expect, it } from 'vitest';
import { toPickedPlace } from '@/features/church-settings/google-maps';

/**
 * Contract of the adapter's mapping: a Places API (New) `Place` after
 * `fetchFields({ fields: ['id', 'addressComponents', 'location'] })`, in the
 * shape Google documents (camelCase `longText`/`shortText`, `location` a LatLng).
 */
const PLACE = {
  id: 'ChIJ-campinas',
  addressComponents: [
    { longText: '120', shortText: '120', types: ['street_number'] },
    {
      longText: 'Rua Barão de Jaguara',
      shortText: 'R. Barão de Jaguara',
      types: ['route'],
    },
    {
      longText: 'Centro',
      shortText: 'Centro',
      types: ['sublocality_level_1', 'sublocality', 'political'],
    },
    {
      longText: 'Campinas',
      shortText: 'Campinas',
      types: ['administrative_area_level_2', 'political'],
    },
    {
      longText: 'São Paulo',
      shortText: 'SP',
      types: ['administrative_area_level_1', 'political'],
    },
    { longText: 'Brasil', shortText: 'BR', types: ['country', 'political'] },
    { longText: '13015-904', shortText: '13015-904', types: ['postal_code'] },
  ],
  location: { lat: () => -22.9056, lng: () => -47.0608 },
};

describe('toPickedPlace', () => {
  it('maps a Places (New) place to the address fields', () => {
    expect(toPickedPlace(PLACE)).toEqual({
      placeId: 'ChIJ-campinas',
      street: 'Rua Barão de Jaguara',
      number: '120',
      bairro: 'Centro',
      city: 'Campinas',
      uf: 'SP',
      cep: '13015904',
      latitude: -22.9056,
      longitude: -47.0608,
    });
  });

  it('falls back to locality and neighborhood, and leaves missing parts empty', () => {
    expect(
      toPickedPlace({
        id: 'ChIJ-x',
        addressComponents: [
          {
            longText: 'Vila Nova',
            shortText: 'Vila Nova',
            types: ['neighborhood'],
          },
          { longText: 'Paraty', shortText: 'Paraty', types: ['locality'] },
        ],
        location: null,
      }),
    ).toEqual({
      placeId: 'ChIJ-x',
      street: '',
      number: '',
      bairro: 'Vila Nova',
      city: 'Paraty',
      uf: '',
      cep: '',
      latitude: null,
      longitude: null,
    });
  });

  it('picks nothing from a place without an id', () => {
    expect(toPickedPlace({ addressComponents: [] })).toBeNull();
  });
});

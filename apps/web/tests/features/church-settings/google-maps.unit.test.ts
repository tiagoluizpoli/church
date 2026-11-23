import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPlaceSearch,
  toPickedPlace,
} from '@/features/church-settings/google-maps';

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

describe('createPlaceSearch', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Fakes the script load and the Places (New) library at `window.google`. */
  function fakeGoogle() {
    const fetchFields = vi.fn().mockResolvedValue(undefined);
    const fetchAutocompleteSuggestions = vi.fn().mockResolvedValue({
      suggestions: [
        {
          placePrediction: {
            placeId: 'ChIJ-campinas',
            text: { text: 'Rua Barão de Jaguara, 120 - Centro, Campinas - SP' },
            mainText: { text: 'Rua Barão de Jaguara, 120' },
            secondaryText: { text: 'Centro, Campinas - SP' },
            toPlace: () => ({ ...PLACE, fetchFields }),
          },
        },
        { placePrediction: null },
      ],
    });
    class AutocompleteSessionToken {}
    const window: Record<string, unknown> = {
      google: {
        maps: {
          importLibrary: async () => ({
            AutocompleteSuggestion: { fetchAutocompleteSuggestions },
            AutocompleteSessionToken,
          }),
        },
      },
    };
    vi.stubGlobal('window', window);
    vi.stubGlobal('document', {
      createElement: () => ({}),
      head: {
        append: () =>
          queueMicrotask(() => (window.__churchMapsReady as () => void)()),
      },
    });
    return { fetchAutocompleteSuggestions, fetchFields };
  }

  it('lists Brazil-only suggestions and maps the picked one, one session token per pick', async () => {
    const google = fakeGoogle();
    const search = createPlaceSearch();

    const suggestions = await search.suggest('Rua Barão');
    expect(suggestions).toEqual([
      {
        placeId: 'ChIJ-campinas',
        main: 'Rua Barão de Jaguara, 120',
        secondary: 'Centro, Campinas - SP',
      },
    ]);
    const request = google.fetchAutocompleteSuggestions.mock.calls[0]?.[0];
    expect(request).toEqual(
      expect.objectContaining({
        input: 'Rua Barão',
        includedRegionCodes: ['br'],
      }),
    );

    await search.suggest('Rua Barão de');
    expect(
      google.fetchAutocompleteSuggestions.mock.calls[1]?.[0].sessionToken,
    ).toBe(request.sessionToken);

    const [first] = suggestions;
    if (!first) throw new Error('no suggestion');
    const picked = await search.pick(first);
    expect(google.fetchFields).toHaveBeenCalledWith({
      fields: ['id', 'addressComponents', 'location'],
    });
    expect(picked).toEqual(
      expect.objectContaining({
        placeId: 'ChIJ-campinas',
        street: 'Rua Barão de Jaguara',
      }),
    );

    await search.suggest('Outra');
    expect(
      google.fetchAutocompleteSuggestions.mock.calls[2]?.[0].sessionToken,
    ).not.toBe(request.sessionToken);
  });

  it('picks nothing for a suggestion it did not list', async () => {
    fakeGoogle();
    const search = createPlaceSearch();
    expect(
      await search.pick({ placeId: 'unknown', main: '', secondary: '' }),
    ).toBeNull();
  });
});

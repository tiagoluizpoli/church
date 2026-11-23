import { env } from '@church/env/web';

/** The Google widgets live behind this module; component tests fake it whole (the widgets never run there). */
export interface PickedPlace {
  placeId: string;
  street: string;
  number: string;
  bairro: string;
  city: string;
  uf: string;
  cep: string;
  latitude: number | null;
  longitude: number | null;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** No browser key for the environment: the search and the map are not offered. */
export function isMapsEnabled(): boolean {
  return Boolean(env.VITE_GOOGLE_MAPS_BROWSER_KEY);
}

// Minimal view of the Maps JavaScript API (Places API New, Advanced Markers);
// it ships no bundled types and one dialog needs little of it.
interface GoogleLatLng {
  lat: () => number;
  lng: () => number;
}
interface LatLngLiteral {
  lat: number;
  lng: number;
}
interface PlaceAddressComponent {
  longText: string | null;
  shortText: string | null;
  types: string[];
}
/** A Places (New) `Place` after `fetchFields`; only the fields read here. */
export interface GooglePlace {
  id?: string | null;
  addressComponents?: PlaceAddressComponent[] | null;
  location?: GoogleLatLng | null;
}
interface FetchFieldsRequest {
  fields: string[];
}
interface FetchablePlace extends GooglePlace {
  fetchFields: (request: FetchFieldsRequest) => Promise<unknown>;
}
interface FormattableText {
  text: string;
}
interface PlacePrediction {
  placeId: string;
  text: FormattableText;
  mainText: FormattableText | null;
  secondaryText: FormattableText | null;
  toPlace: () => FetchablePlace;
}
interface AutocompleteSuggestionResult {
  placePrediction: PlacePrediction | null;
}
interface FetchSuggestionsRequest {
  input: string;
  sessionToken: object;
  includedRegionCodes: string[];
  language: string;
  region: string;
}
interface MapInstance {
  setCenter: (position: LatLngLiteral) => void;
}
interface AdvancedMarker {
  map: MapInstance | null;
  position: GoogleLatLng | LatLngLiteral | null;
  // named-parameters-ignore: Google Maps JavaScript API signature, not ours
  addListener: (event: string, handler: () => void) => void;
}
interface GoogleMapsApi {
  maps: {
    importLibrary: (name: string) => Promise<unknown>;
  };
}
interface PlacesLibrary {
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (
      request: FetchSuggestionsRequest,
    ) => Promise<{ suggestions: AutocompleteSuggestionResult[] }>;
  };
  AutocompleteSessionToken: new () => object;
}
interface MapsLibrary {
  // named-parameters-ignore: Google Maps JavaScript API signature, not ours
  Map: new (
    element: HTMLElement,
    options: object,
  ) => MapInstance;
}
interface MarkerLibrary {
  AdvancedMarkerElement: new (options: object) => AdvancedMarker;
}

interface WindowWithGoogle {
  google: GoogleMapsApi;
  [READY_CALLBACK]?: () => void;
}

const READY_CALLBACK = '__churchMapsReady';
/** Advanced Markers need a Map ID; only development falls back to Google's shared demo one. */
const MAP_ID =
  env.VITE_GOOGLE_MAPS_MAP_ID ??
  (import.meta.env.DEV ? 'DEMO_MAP_ID' : undefined);

let loading: Promise<GoogleMapsApi> | undefined;

function loadApi(): Promise<GoogleMapsApi> {
  loading ??= new Promise<GoogleMapsApi>((resolve, reject) => {
    const global = window as unknown as WindowWithGoogle;
    const script = document.createElement('script');
    const key = encodeURIComponent(env.VITE_GOOGLE_MAPS_BROWSER_KEY ?? '');
    global[READY_CALLBACK] = () => resolve(global.google);
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=${READY_CALLBACK}&language=pt-BR&region=BR`;
    script.async = true;
    script.onerror = () => {
      loading = undefined;
      reject(new Error('Google Maps failed to load'));
    };
    document.head.append(script);
  });
  return loading;
}

interface ImportInput {
  name: 'places' | 'maps' | 'marker';
}

async function importLibrary<T>({ name }: ImportInput): Promise<T> {
  const google = await loadApi();
  return (await google.maps.importLibrary(name)) as T;
}

interface ComponentInput {
  place: GooglePlace;
  type: string;
  short?: boolean;
}

function component({ place, type, short = false }: ComponentInput) {
  const found = place.addressComponents?.find((item) =>
    item.types.includes(type),
  );
  return (short ? found?.shortText : found?.longText) ?? '';
}

/** Reads only the Essentials fields requested below; never the place's display name. */
export function toPickedPlace(place: GooglePlace): PickedPlace | null {
  if (!place.id) return null;
  const { location } = place;
  return {
    placeId: place.id,
    street: component({ place, type: 'route' }),
    number: component({ place, type: 'street_number' }),
    bairro:
      component({ place, type: 'sublocality_level_1' }) ||
      component({ place, type: 'sublocality' }) ||
      component({ place, type: 'neighborhood' }),
    city:
      component({ place, type: 'administrative_area_level_2' }) ||
      component({ place, type: 'locality' }),
    uf: component({ place, type: 'administrative_area_level_1', short: true }),
    cep: component({ place, type: 'postal_code' }).replace(/\D/g, ''),
    latitude: location ? location.lat() : null,
    longitude: location ? location.lng() : null,
  };
}

// Essentials fields only: no display name, ratings, photos or hours.
const PLACE_FIELDS = ['id', 'addressComponents', 'location'];

/** One Google suggestion for what the admin typed. */
export interface PlaceSuggestion {
  placeId: string;
  /** The street or place, the line the admin recognises. */
  main: string;
  /** Bairro, city and state, shown muted. */
  secondary: string;
}

export interface PlaceSearch {
  /** Brazil-only suggestions for the typed text (Places API New); rejects when Google cannot answer. */
  suggest: (input: string) => Promise<PlaceSuggestion[]>;
  /** The address fields of a suggestion from the latest `suggest`; ends the billing session. */
  pick: (suggestion: PlaceSuggestion) => Promise<PickedPlace | null>;
}

/** Google's place search behind the dialog's own search field; one session token per search-and-pick. */
export function createPlaceSearch(): PlaceSearch {
  let token: object | undefined;
  let predictions = new Map<string, PlacePrediction>();
  return {
    suggest: async (input) => {
      const { AutocompleteSuggestion, AutocompleteSessionToken } =
        await importLibrary<PlacesLibrary>({ name: 'places' });
      token ??= new AutocompleteSessionToken();
      const { suggestions } =
        await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          sessionToken: token,
          includedRegionCodes: ['br'],
          language: 'pt-BR',
          region: 'br',
        });
      predictions = new Map();
      return suggestions.flatMap(({ placePrediction: prediction }) => {
        if (!prediction) return [];
        predictions.set(prediction.placeId, prediction);
        return [
          {
            placeId: prediction.placeId,
            main: prediction.mainText?.text ?? prediction.text.text,
            secondary: prediction.secondaryText?.text ?? '',
          },
        ];
      });
    },
    pick: async ({ placeId }) => {
      const prediction = predictions.get(placeId);
      if (!prediction) return null;
      const place = prediction.toPlace();
      await place.fetchFields({ fields: PLACE_FIELDS });
      token = undefined;
      return toPickedPlace(place);
    },
  };
}

export interface PinMap {
  setPin: (pin: LatLng | null) => void;
  destroy: () => void;
}

interface MountPinMapInput {
  element: HTMLElement;
  pin: LatLng | null;
  /** The admin dragged the pin to here. */
  onDrag: (pin: LatLng) => void;
  onError: () => void;
}

const BRAZIL_CENTER = { lat: -14.235, lng: -51.925 };
const PIN_ZOOM = 17;
const COUNTRY_ZOOM = 4;

interface ReadPositionInput {
  position: AdvancedMarker['position'];
}

function readPosition({ position }: ReadPositionInput): LatLng | null {
  if (!position) return null;
  return typeof position.lat === 'function'
    ? {
        latitude: (position as GoogleLatLng).lat(),
        longitude: (position as GoogleLatLng).lng(),
      }
    : {
        latitude: (position as LatLngLiteral).lat,
        longitude: (position as LatLngLiteral).lng,
      };
}

/** A map with one draggable pin (Advanced Marker). */
export function mountPinMap({
  element,
  pin,
  onDrag,
  onError,
}: MountPinMapInput): PinMap {
  let active = true;
  let apply: (pin: LatLng | null) => void = () => undefined;
  let latest = pin;
  Promise.all([
    importLibrary<MapsLibrary>({ name: 'maps' }),
    importLibrary<MarkerLibrary>({ name: 'marker' }),
  ])
    .then(([{ Map: GoogleMap }, { AdvancedMarkerElement }]) => {
      if (!active) return;
      const map = new GoogleMap(element, {
        center: pin ? { lat: pin.latitude, lng: pin.longitude } : BRAZIL_CENTER,
        zoom: pin ? PIN_ZOOM : COUNTRY_ZOOM,
        mapId: MAP_ID,
        streetViewControl: false,
        mapTypeControl: false,
      });
      const marker = new AdvancedMarkerElement({ gmpDraggable: true });
      marker.addListener('dragend', () => {
        const at = readPosition({ position: marker.position });
        if (at) onDrag(at);
      });
      apply = (next) => {
        marker.map = next ? map : null;
        if (!next) return;
        const at = { lat: next.latitude, lng: next.longitude };
        marker.position = at;
        map.setCenter(at);
      };
      apply(latest);
    })
    .catch(() => {
      if (active) onError();
    });
  return {
    setPin: (next) => {
      latest = next;
      apply(next);
    },
    destroy: () => {
      active = false;
    },
  };
}

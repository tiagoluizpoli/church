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

// Minimal view of the Maps JavaScript API; it ships no bundled types and one dialog needs little of it.
interface GoogleMapsApi {
  maps: {
    // named-parameters-ignore: Google Maps JavaScript API signature, not ours
    Map: new (
      element: HTMLElement,
      options: object,
    ) => MapInstance;
    Marker: new (options: object) => MarkerInstance;
    places: {
      // named-parameters-ignore: Google Maps JavaScript API signature, not ours
      Autocomplete: new (
        input: HTMLInputElement,
        options: object,
      ) => AutocompleteInstance;
    };
  };
}
interface MapInstance {
  setCenter: (position: object) => void;
}
interface MarkerInstance {
  setPosition: (position: object) => void;
  setMap: (map: MapInstance | null) => void;
  // named-parameters-ignore: Google Maps JavaScript API signature, not ours
  addListener: (event: string, handler: () => void) => void;
  getPosition: () => { lat: () => number; lng: () => number } | null;
}
interface AutocompleteInstance {
  // named-parameters-ignore: Google Maps JavaScript API signature, not ours
  addListener: (event: string, handler: () => void) => void;
  getPlace: () => PlaceResult;
}
interface PlaceResult {
  // biome-ignore lint/style/useNamingConvention: Google's field names
  place_id?: string;
  // biome-ignore lint/style/useNamingConvention: Google's field names
  address_components?: {
    // biome-ignore lint/style/useNamingConvention: Google's field names
    long_name: string;
    // biome-ignore lint/style/useNamingConvention: Google's field names
    short_name: string;
    types: string[];
  }[];
  geometry?: { location?: { lat: () => number; lng: () => number } };
}

interface WindowWithGoogle {
  google: GoogleMapsApi;
}

let loading: Promise<GoogleMapsApi> | undefined;

function loadApi(): Promise<GoogleMapsApi> {
  loading ??= new Promise<GoogleMapsApi>((resolve, reject) => {
    const script = document.createElement('script');
    const key = encodeURIComponent(env.VITE_GOOGLE_MAPS_BROWSER_KEY ?? '');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&language=pt-BR&region=BR`;
    script.async = true;
    script.onload = () =>
      resolve((window as unknown as WindowWithGoogle).google);
    script.onerror = () => {
      loading = undefined;
      reject(new Error('Google Maps failed to load'));
    };
    document.head.append(script);
  });
  return loading;
}

interface ComponentInput {
  place: PlaceResult;
  type: string;
  short?: boolean;
}

function component({ place, type, short = false }: ComponentInput) {
  const found = place.address_components?.find((item) =>
    item.types.includes(type),
  );
  return (short ? found?.short_name : found?.long_name) ?? '';
}

/** Reads only the Essentials fields requested below; never the place's display name. */
export function toPickedPlace(place: PlaceResult): PickedPlace | null {
  if (!place.place_id) return null;
  const location = place.geometry?.location;
  return {
    placeId: place.place_id,
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

interface AttachPlaceSearchInput {
  input: HTMLInputElement;
  onPick: (place: PickedPlace) => void;
}

/** Google place search on `input`, restricted to Brazil; returns the cleanup. */
export function attachPlaceSearch({
  input,
  onPick,
}: AttachPlaceSearchInput): () => void {
  let active = true;
  loadApi()
    .then((google) => {
      if (!active) return;
      const autocomplete = new google.maps.places.Autocomplete(input, {
        componentRestrictions: { country: 'br' },
        // Essentials fields only: no display name, ratings, photos or hours.
        fields: [
          'place_id',
          'address_components',
          'formatted_address',
          'geometry',
        ],
        types: ['address'],
      });
      autocomplete.addListener('place_changed', () => {
        const picked = toPickedPlace(autocomplete.getPlace());
        if (picked) onPick(picked);
      });
    })
    .catch(() => undefined); // The search just stays inert; CEP and manual entry still work.
  return () => {
    active = false;
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
}

const BRAZIL_CENTER = { lat: -14.235, lng: -51.925 };

/** A map with one draggable pin. */
export function mountPinMap({
  element,
  pin,
  onDrag,
}: MountPinMapInput): PinMap {
  let active = true;
  let apply: (pin: LatLng | null) => void = () => undefined;
  let latest = pin;
  loadApi()
    .then((google) => {
      if (!active) return;
      const map = new google.maps.Map(element, {
        center: pin ? { lat: pin.latitude, lng: pin.longitude } : BRAZIL_CENTER,
        zoom: pin ? 17 : 4,
        streetViewControl: false,
        mapTypeControl: false,
      });
      const marker = new google.maps.Marker({ draggable: true });
      marker.addListener('dragend', () => {
        const at = marker.getPosition();
        if (at) onDrag({ latitude: at.lat(), longitude: at.lng() });
      });
      apply = (next) => {
        marker.setMap(next ? map : null);
        if (!next) return;
        const at = { lat: next.latitude, lng: next.longitude };
        marker.setPosition(at);
        map.setCenter(at);
      };
      apply(latest);
    })
    .catch(() => undefined);
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

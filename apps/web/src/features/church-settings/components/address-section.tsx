import { m } from '@church/i18n/messages';
import {
  ArrowDown,
  ArrowUp,
  Home,
  MapPin,
  Pencil,
  PenLine,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { IconInput, IconInputField } from '@/components/icon-input-field';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  type CepAddress,
  lookupCep,
  normalizeCep,
} from '@/features/church-settings/cep-client';
import {
  type AddressDraft,
  type AddressReplacement,
  addressSummary,
} from '@/features/church-settings/church-settings-form';
import {
  createPlaceSearch,
  isMapsEnabled,
  type LatLng,
  mountPinMap,
  type PickedPlace,
  type PinMap,
  type PlaceSuggestion,
} from '@/features/church-settings/google-maps';
import { useControlSizes } from '@/features/church-settings/use-control-sizes';
import type { GetChurchAddressUsage200 } from '@/infrastructure/api/churchAPI.schemas';
import { churchSettingsApi } from '@/utils/api-instances';

export const BRAZILIAN_UFS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
] as const;

const NO_NUMBER = 's/n';

type FieldErrors = Record<string, string>;

interface DraftFields {
  label: string;
  street: string;
  number: string;
  noNumber: boolean;
  complement: string;
  bairro: string;
  city: string;
  uf: string;
  cep: string;
  isPublic: boolean;
  latitude: number | null;
  longitude: number | null;
  pinSource: AddressDraft['pinSource'];
  /** The Google place the fields came from; kept only while street, number and city stay as picked. */
  picked: PickedOrigin | null;
}

/** What a Google pick filled, to tell whether the admin changed it since. */
interface PickedOrigin {
  placeId: string;
  street: string;
  number: string;
  city: string;
}

/** An address the admin asked to delete, with where it is still used. */
interface PendingDeletion {
  address: AddressDraft;
  usage: GetChurchAddressUsage200;
}

interface ToFieldsInput {
  address: AddressDraft | null;
}

function toFields({ address }: ToFieldsInput): DraftFields {
  return {
    label: address?.label ?? '',
    street: address?.street ?? '',
    number: address && address.number !== NO_NUMBER ? address.number : '',
    noNumber: address?.number === NO_NUMBER,
    complement: address?.complement ?? '',
    bairro: address?.bairro ?? '',
    city: address?.city ?? '',
    uf: address?.uf ?? '',
    cep: address?.cep ?? '',
    isPublic: address?.isPublic ?? true,
    latitude: address?.latitude ?? null,
    longitude: address?.longitude ?? null,
    pinSource: address?.pinSource ?? null,
    picked: address?.placeId
      ? {
          placeId: address.placeId,
          street: address.street,
          number: address.number,
          city: address.city,
        }
      : null,
  };
}

interface ProposePinInput {
  proposed: LatLng;
  pinSource: 'google' | 'cep';
}

interface SetPinInput {
  moved: LatLng | null;
  pinSource: 'admin' | null;
}

/** Digits, dots, dashes and spaces only: the admin is typing a CEP, not a street. */
const CEP_LIKE = /^[\d.\-\s]+$/;
const SEARCH_DELAY_MS = 300;
const MIN_SEARCH_LENGTH = 3;

type SearchStatus =
  | 'idle'
  | 'loading'
  | 'invalid'
  | 'cepOnly'
  | 'notFound'
  | 'failed'
  | 'none'
  | 'mapsFailed';

interface AddressSearchProps {
  mapsEnabled: boolean;
  onCep: (found: CepAddress) => void;
  onPlace: (place: PickedPlace) => void;
  onManual: () => void;
}

/** One field for both: 8 digits look up the CEP, text asks Google (when the environment has a key). */
function AddressSearch({
  mapsEnabled,
  onCep,
  onPlace,
  onManual,
}: AddressSearchProps) {
  const id = React.useId();
  const input = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState('');
  const [status, setStatus] = React.useState<SearchStatus>('idle');
  const [suggestions, setSuggestions] = React.useState<PlaceSuggestion[]>([]);
  const places = React.useMemo(
    () => (mapsEnabled ? createPlaceSearch() : null),
    [mapsEnabled],
  );
  // Each lookup takes a number; an answer for an older one is dropped.
  const latest = React.useRef(0);

  React.useEffect(() => input.current?.focus(), []);

  const lookup = async (cep: string) => {
    const ask = ++latest.current;
    setStatus('loading');
    try {
      const found = await lookupCep({ cep });
      if (ask !== latest.current) return;
      if (!found) return setStatus('notFound');
      setStatus('idle');
      onCep({ ...found, cep: found.cep || cep });
    } catch {
      // Every failure reads the same to the admin: manual entry stays usable.
      if (ask === latest.current) setStatus('failed');
    }
  };

  React.useEffect(() => {
    const text = query.trim();
    if (!places || CEP_LIKE.test(text) || text.length < MIN_SEARCH_LENGTH) {
      return;
    }
    const ask = ++latest.current;
    const timer = setTimeout(() => {
      setStatus('loading');
      places
        .suggest(text)
        .then((found) => {
          if (ask !== latest.current) return;
          setSuggestions(found);
          setStatus(found.length ? 'idle' : 'none');
        })
        .catch(() => {
          if (ask === latest.current) setStatus('mapsFailed');
        });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, places]);

  const change = (value: string) => {
    setQuery(value);
    setSuggestions([]);
    const cep = normalizeCep(value);
    if (cep) return void lookup(cep);
    latest.current += 1;
    const text = value.trim();
    setStatus(!places && text && !CEP_LIKE.test(text) ? 'cepOnly' : 'idle');
  };

  const submit = () => {
    const text = query.trim();
    if (!text || normalizeCep(text)) return;
    if (CEP_LIKE.test(text) || !places) setStatus('invalid');
  };

  const choose = async (suggestion: PlaceSuggestion) => {
    if (!places) return;
    const ask = ++latest.current;
    setStatus('loading');
    try {
      const place = await places.pick(suggestion);
      if (ask !== latest.current) return;
      if (!place) return setStatus('mapsFailed');
      setStatus('idle');
      onPlace(place);
    } catch {
      if (ask === latest.current) setStatus('mapsFailed');
    }
  };

  const message = {
    idle: null,
    loading: null,
    invalid: m.church_settings_address_cep_invalid(),
    cepOnly: m.church_settings_address_search_cep_only(),
    notFound: m.church_settings_address_cep_not_found(),
    failed: m.church_settings_address_cep_failed(),
    none: m.church_settings_address_search_none(),
    mapsFailed: m.church_settings_address_maps_failed(),
  }[status];
  const quiet = status === 'cepOnly' || status === 'none';

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={id} className="font-medium text-sm">
          {m.church_settings_address_search()}
        </Label>
        <IconInput
          ref={input}
          id={id}
          icon={Search}
          type="search"
          autoComplete="off"
          value={query}
          placeholder={
            places
              ? m.church_settings_address_search_placeholder_maps()
              : m.church_settings_address_search_placeholder_cep()
          }
          aria-describedby={message ? `${id}-message` : undefined}
          onChange={(event) => change(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            submit();
          }}
        />
      </div>
      {status === 'loading' ? (
        <p role="status" className="text-muted-foreground text-sm">
          {m.church_settings_address_search_loading()}
        </p>
      ) : null}
      {message ? (
        <p
          id={`${id}-message`}
          role={quiet ? 'status' : 'alert'}
          className={
            quiet ? 'text-muted-foreground text-sm' : 'text-destructive text-sm'
          }
        >
          {message}
        </p>
      ) : null}
      {suggestions.length ? (
        <ul
          aria-label={m.church_settings_address_search_results()}
          className="radius-control divide-y border"
        >
          {suggestions.map((suggestion) => (
            <li key={suggestion.placeId}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                onClick={() => choose(suggestion)}
              >
                <MapPin
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-sm">
                    {suggestion.main}
                  </span>{' '}
                  <span className="block truncate text-muted-foreground text-xs">
                    {suggestion.secondary}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button type="button" variant="outline" onClick={onManual}>
        <PenLine aria-hidden /> {m.church_settings_address_search_manual()}
      </Button>
    </div>
  );
}

interface AddressDialogProps {
  /** `undefined` closed, `null` adding, a draft editing it. */
  editing: AddressDraft | null | undefined;
  /** This row's refusals from the last save, by field name. */
  errors: FieldErrors;
  onCancel: () => void;
  onConfirm: (fields: DraftFields) => void;
}

/** Which field takes focus when the structured fields appear. */
type FocusTarget = 'street' | 'number' | 'complement' | null;

function AddressDialog({
  editing,
  errors,
  onCancel,
  onConfirm,
}: AddressDialogProps) {
  const sizes = useControlSizes();
  const [fields, setFields] = React.useState<DraftFields>(() =>
    toFields({ address: editing ?? null }),
  );
  const set = (changes: Partial<DraftFields>) =>
    setFields((current) => ({ ...current, ...changes }));
  const complete =
    fields.street.trim() !== '' &&
    (fields.noNumber || fields.number.trim() !== '') &&
    fields.bairro.trim() !== '' &&
    fields.city.trim() !== '' &&
    fields.uf !== '';
  const adding = editing === null;
  // A new address starts from the search; an existing one opens on its fields.
  const [stage, setStage] = React.useState<'search' | 'fields'>(
    adding ? 'search' : 'fields',
  );
  const [focusTarget, setFocusTarget] = React.useState<FocusTarget>(null);
  const [cepFilled, setCepFilled] = React.useState(false);
  const streetInput = React.useRef<HTMLInputElement>(null);
  const numberInput = React.useRef<HTMLInputElement>(null);
  const complementInput = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (stage !== 'fields' || !focusTarget) return;
    ({ street: streetInput, number: numberInput, complement: complementInput })[
      focusTarget
    ].current?.focus();
    setFocusTarget(null);
  }, [stage, focusTarget]);

  const reveal = (focus: FocusTarget) => {
    setStage('fields');
    setFocusTarget(focus);
  };

  // Fills the same editable fields as manual entry; nothing is saved until the admin confirms.
  const fillFromCep = (found: CepAddress) => {
    // A CEP's coordinates are only a proposal; they never replace a pin the admin placed.
    if (
      found.latitude !== undefined &&
      found.longitude !== undefined &&
      fields.pinSource !== 'admin'
    ) {
      proposePin({
        proposed: { latitude: found.latitude, longitude: found.longitude },
        pinSource: 'cep',
      });
    }
    // Merged into the current fields: what was typed during the lookup stays.
    setFields((current) => ({
      ...current,
      cep: found.cep,
      street: found.street || current.street,
      bairro: found.bairro || current.bairro,
      city: found.city || current.city,
      uf: found.uf || current.uf,
    }));
    setCepFilled(true);
    reveal('number');
  };
  const mapsEnabled = isMapsEnabled();
  const pin: LatLng | null =
    fields.latitude !== null && fields.longitude !== null
      ? { latitude: fields.latitude, longitude: fields.longitude }
      : null;
  // State, not a ref: the map's element mounts with the fields, after the first effect pass.
  const [mapsFailed, setMapsFailed] = React.useState(false);
  const [mapEl, setMapEl] = React.useState<HTMLDivElement | null>(null);
  const pinMap = React.useRef<PinMap | null>(null);
  const latestPin = React.useRef(pin);
  latestPin.current = pin;

  const proposePin = ({ proposed, pinSource }: ProposePinInput) =>
    set({ ...proposed, pinSource });
  const setPin = ({ moved, pinSource }: SetPinInput) =>
    set({
      latitude: moved?.latitude ?? null,
      longitude: moved?.longitude ?? null,
      pinSource,
    });
  const pick = (place: PickedPlace) => {
    setFields((current) => ({
      ...current,
      street: place.street || current.street,
      number: place.number || current.number,
      noNumber: place.number ? false : current.noNumber,
      bairro: place.bairro || current.bairro,
      city: place.city || current.city,
      uf: place.uf || current.uf,
      cep: place.cep || current.cep,
      picked: {
        placeId: place.placeId,
        street: place.street || current.street,
        number: place.number || (current.noNumber ? NO_NUMBER : current.number),
        city: place.city || current.city,
      },
      ...(place.latitude !== null && place.longitude !== null
        ? {
            latitude: place.latitude,
            longitude: place.longitude,
            pinSource: 'google' as const,
          }
        : {}),
    }));
    setCepFilled(false);
    reveal(place.number ? 'complement' : 'number');
  };
  const dragged = React.useRef((moved: LatLng) =>
    setPin({ moved, pinSource: 'admin' }),
  );
  dragged.current = (moved) => setPin({ moved, pinSource: 'admin' });

  React.useEffect(() => {
    if (!mapsEnabled || !mapEl) return;
    const map = mountPinMap({
      element: mapEl,
      pin: latestPin.current,
      onDrag: (moved) => dragged.current(moved),
      onError: () => setMapsFailed(true),
    });
    pinMap.current = map;
    return () => {
      map.destroy();
      pinMap.current = null;
    };
  }, [mapsEnabled, mapEl]);

  const pinLatitude = pin?.latitude ?? null;
  const pinLongitude = pin?.longitude ?? null;
  React.useEffect(
    () =>
      pinMap.current?.setPin(
        pinLatitude === null || pinLongitude === null
          ? null
          : { latitude: pinLatitude, longitude: pinLongitude },
      ),
    [pinLatitude, pinLongitude],
  );

  return (
    <ResponsiveFormSurface
      open
      onOpenChange={(open) => (open ? undefined : onCancel())}
      title={
        adding
          ? m.church_settings_address_dialog_add()
          : m.church_settings_address_dialog_edit()
      }
      description={
        adding
          ? m.church_settings_address_dialog_description_add()
          : m.church_settings_address_dialog_description_edit()
      }
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {m.church_settings_address_cancel()}
          </Button>
          <Button disabled={!complete} onClick={() => onConfirm(fields)}>
            {adding
              ? m.church_settings_address_confirm_add()
              : m.church_settings_address_confirm_edit()}
          </Button>
        </>
      }
    >
      {/* Desktop scrolls the body under a fixed footer; the mobile drawer scrolls on its own. */}
      <div className="pt-2 md:-mx-1 md:max-h-[65dvh] md:overflow-y-auto md:px-1 md:pt-0 md:pb-1">
        {stage === 'search' ? (
          <AddressSearch
            mapsEnabled={mapsEnabled}
            onCep={fillFromCep}
            onPlace={pick}
            onManual={() => reveal('street')}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
              {cepFilled ? (
                <p className="text-muted-foreground text-sm" role="status">
                  {m.church_settings_address_cep_filled()}
                </p>
              ) : (
                <span />
              )}
              <Button
                type="button"
                variant="ghost"
                size={sizes.small}
                onClick={() => {
                  setCepFilled(false);
                  setStage('search');
                }}
              >
                <Search aria-hidden />{' '}
                {m.church_settings_address_search_again()}
              </Button>
            </div>
            <div className="sm:col-span-2">
              <IconInputField
                ref={streetInput}
                label={m.church_settings_address_street()}
                value={fields.street}
                error={errors.street}
                autoComplete="address-line1"
                onChange={(event) => set({ street: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <IconInputField
                ref={numberInput}
                label={m.church_settings_address_number()}
                value={fields.noNumber ? '' : fields.number}
                error={errors.number}
                disabled={fields.noNumber}
                inputMode="numeric"
                onChange={(event) => set({ number: event.target.value })}
              />
              <Label className="flex items-center gap-2 font-normal text-sm">
                <Checkbox
                  checked={fields.noNumber}
                  onCheckedChange={(checked) =>
                    set({ noNumber: checked === true })
                  }
                />
                {m.church_settings_address_no_number()}
              </Label>
            </div>
            <IconInputField
              ref={complementInput}
              label={m.church_settings_address_complement()}
              hint={m.church_settings_address_optional()}
              value={fields.complement}
              error={errors.complement}
              onChange={(event) => set({ complement: event.target.value })}
            />
            <IconInputField
              label={m.church_settings_address_bairro()}
              value={fields.bairro}
              error={errors.bairro}
              onChange={(event) => set({ bairro: event.target.value })}
            />
            <IconInputField
              label={m.church_settings_address_city()}
              value={fields.city}
              error={errors.city}
              autoComplete="address-level2"
              onChange={(event) => set({ city: event.target.value })}
            />
            <div className="space-y-1.5">
              <Label className="font-medium text-sm">
                {m.church_settings_address_uf()}
              </Label>
              <Select
                value={fields.uf}
                onValueChange={(uf) => set({ uf: uf ?? '' })}
              >
                <SelectTrigger
                  aria-label={m.church_settings_address_uf()}
                  aria-invalid={errors.uf ? true : undefined}
                  className="w-full"
                >
                  <SelectValue
                    placeholder={m.church_settings_address_uf_placeholder()}
                  >
                    {fields.uf || undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {BRAZILIAN_UFS.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.uf ? (
                <p className="text-destructive text-sm">{errors.uf}</p>
              ) : null}
            </div>
            <IconInputField
              label={m.church_settings_address_cep()}
              hint={m.church_settings_address_optional()}
              value={fields.cep}
              error={errors.cep}
              inputMode="numeric"
              autoComplete="postal-code"
              onChange={(event) => set({ cep: event.target.value })}
            />
            <div className="sm:col-span-2">
              <IconInputField
                icon={Home}
                label={m.church_settings_address_label_label()}
                hint={m.church_settings_address_label_hint()}
                value={fields.label}
                error={errors.label}
                onChange={(event) => set({ label: event.target.value })}
              />
            </div>
            {mapsEnabled ? (
              <div className="space-y-2 sm:col-span-2">
                <p className="font-medium text-sm">
                  {m.church_settings_address_pin_label()}
                </p>
                {mapsFailed ? (
                  <p role="alert" className="text-destructive text-sm">
                    {m.church_settings_address_maps_failed()}
                  </p>
                ) : null}
                <div
                  ref={setMapEl}
                  role="application"
                  aria-label={m.church_settings_address_pin_map()}
                  className="radius-surface h-56 w-full border bg-muted/30"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-muted-foreground text-sm" role="status">
                    {fields.pinSource
                      ? {
                          google: m.church_settings_address_pin_source_google(),
                          cep: m.church_settings_address_pin_source_cep(),
                          admin: m.church_settings_address_pin_source_admin(),
                        }[fields.pinSource]
                      : m.church_settings_address_pin_none()}
                  </p>
                  {pin ? (
                    <div className="flex gap-2">
                      {fields.pinSource === 'admin' ? null : (
                        <Button
                          type="button"
                          variant="outline"
                          size={sizes.small}
                          onClick={() =>
                            setPin({ moved: pin, pinSource: 'admin' })
                          }
                        >
                          {m.church_settings_address_pin_confirm()}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size={sizes.small}
                        onClick={() => setPin({ moved: null, pinSource: null })}
                      >
                        {m.church_settings_address_pin_remove()}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
        {stage === 'fields' ? (
          <div className="mt-4 space-y-2 border-t pt-4">
            <Label className="flex items-center justify-between gap-3 font-medium text-sm">
              <span>
                {m.church_settings_address_public()}
                <span className="block font-normal text-muted-foreground">
                  {m.church_settings_address_public_hint()}
                </span>
              </span>
              <Switch
                checked={fields.isPublic}
                onCheckedChange={(isPublic) => set({ isPublic })}
              />
            </Label>
            <p className="radius-control bg-muted/50 p-3 text-muted-foreground text-sm">
              {m.church_settings_address_home_note()}
            </p>
          </div>
        ) : null}
      </div>
    </ResponsiveFormSurface>
  );
}

const NO_PLACE = 'none';

interface DeleteInUseDialogProps {
  address: AddressDraft;
  usage: GetChurchAddressUsage200;
  /** Saved addresses that stay, the possible replacements. */
  options: AddressDraft[];
  onCancel: () => void;
  onConfirm: (replacementId: string | null) => void;
}

/** Lists where an address is used and proposes a replacement: the Main Address by default, another address, or *Sem local*. */
function DeleteInUseDialog({
  address,
  usage,
  options,
  onCancel,
  onConfirm,
}: DeleteInUseDialogProps) {
  const [choice, setChoice] = React.useState<string>(
    () => options.find((option) => option.isMain)?.id ?? NO_PLACE,
  );
  const label = (option: AddressDraft) =>
    option.label ?? addressSummary({ address: option });
  const chosenLabel =
    choice === NO_PLACE
      ? m.church_settings_address_replacement_none()
      : label(options.find((option) => option.id === choice) ?? address);
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {m.church_settings_address_in_use_title({
              name: address.label ?? addressSummary({ address }),
            })}
          </DialogTitle>
          <DialogDescription>
            {m.church_settings_address_in_use_description()}
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {usage.templates.map((template) => (
            <li key={template.id}>
              {m.church_settings_address_in_use_template({
                name: template.name,
              })}
            </li>
          ))}
          {usage.events.map((item) => (
            <li key={item.id}>
              {m.church_settings_address_in_use_event({ title: item.title })}
            </li>
          ))}
        </ul>
        <div className="space-y-1.5">
          <Label className="font-medium text-sm">
            {m.church_settings_address_replacement_label()}
          </Label>
          <Select
            value={choice}
            onValueChange={(next) => setChoice(next ?? NO_PLACE)}
          >
            <SelectTrigger
              aria-label={m.church_settings_address_replacement_label()}
              className="w-full"
            >
              <SelectValue>{chosenLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.key} value={option.id ?? ''}>
                  {label(option)}
                </SelectItem>
              ))}
              <SelectItem value={NO_PLACE}>
                {m.church_settings_address_replacement_none()}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            {m.church_settings_address_cancel()}
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(choice === NO_PLACE ? null : choice)}
          >
            {m.church_settings_address_in_use_confirm()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface StillPickedInput {
  fields: DraftFields;
}

/** The Google `place_id` only describes the address while street, number and city stay as picked. */
function stillPicked({ fields }: StillPickedInput): boolean {
  const { picked } = fields;
  return (
    picked !== null &&
    picked.street === fields.street.trim() &&
    picked.number === (fields.noNumber ? NO_NUMBER : fields.number.trim()) &&
    picked.city === fields.city.trim()
  );
}

interface FieldsToDraftInput {
  fields: DraftFields;
  previous: AddressDraft | null;
  key: string;
}

function toDraft({ fields, previous, key }: FieldsToDraftInput): AddressDraft {
  return {
    id: previous?.id ?? null,
    key: previous?.key ?? key,
    label: fields.label.trim() || null,
    street: fields.street.trim(),
    number: fields.noNumber ? NO_NUMBER : fields.number.trim(),
    complement: fields.complement.trim() || null,
    bairro: fields.bairro.trim(),
    city: fields.city.trim(),
    uf: fields.uf as AddressDraft['uf'],
    cep: fields.cep.trim() || null,
    isPublic: fields.isPublic,
    isMain: previous?.isMain ?? false,
    latitude: fields.latitude,
    longitude: fields.longitude,
    pinSource: fields.latitude === null ? null : fields.pinSource,
    placeId: stillPicked({ fields }) ? (fields.picked?.placeId ?? null) : null,
  };
}

interface RowErrorsInput {
  errors: FieldErrors;
  index: number;
}

/** The refusals of one row, keyed by field name (`addresses.2.street` → `street`). */
function rowErrors({ errors, index }: RowErrorsInput): FieldErrors {
  const prefix = `addresses.${index}.`;
  return Object.fromEntries(
    Object.entries(errors)
      .filter(([field]) => field.startsWith(prefix))
      .map(([field, message]) => [field.slice(prefix.length), message]),
  );
}

interface UpdateInput {
  key: string;
  changes: Partial<AddressDraft>;
}

interface MoveInput {
  index: number;
  by: -1 | 1;
}

interface AddressDeletion {
  addresses: AddressDraft[];
  replacements?: AddressReplacement[];
}

interface AddressSectionProps {
  addresses: AddressDraft[];
  errors: FieldErrors;
  replacements: AddressReplacement[];
  onChange: (addresses: AddressDraft[]) => void;
  /** A saved address deleted with its replacement; both stage into the save bar together. */
  onDelete: (change: AddressDeletion) => void;
}

/** The Church's addresses: a list staged into the screen's save bar, added and edited in a dialog. */
export function AddressSection({
  addresses,
  errors,
  replacements,
  onChange,
  onDelete,
}: AddressSectionProps) {
  const sizes = useControlSizes();
  const [deleting, setDeleting] = React.useState<PendingDeletion | undefined>(
    undefined,
  );
  const [editingKey, setEditingKey] = React.useState<string | null | undefined>(
    undefined,
  );
  const counter = React.useRef(0);
  const editing =
    editingKey === undefined
      ? undefined
      : (addresses.find((address) => address.key === editingKey) ?? null);

  const update = ({ key, changes }: UpdateInput) =>
    onChange(
      addresses.map((address) =>
        address.key === key ? { ...address, ...changes } : address,
      ),
    );

  const makeMain = (key: string) =>
    onChange(
      addresses.map((address) => ({ ...address, isMain: address.key === key })),
    );

  const move = ({ index, by }: MoveInput) => {
    const next = [...addresses];
    const [row] = next.splice(index, 1);
    next.splice(index + by, 0, row as AddressDraft);
    onChange(next);
  };

  const confirm = (fields: DraftFields) => {
    counter.current += 1;
    const draft = toDraft({
      fields,
      previous: editing ?? null,
      key: `new-${counter.current}`,
    });
    if (editing) {
      onChange(
        addresses.map((address) =>
          address.key === editing.key ? draft : address,
        ),
      );
    } else {
      // The first address a Church gets is its Main Address.
      onChange([...addresses, { ...draft, isMain: addresses.length === 0 }]);
    }
    setEditingKey(undefined);
  };

  const remove = (key: string) => {
    const rest = addresses.filter((address) => address.key !== key);
    onChange(rest);
  };

  // A saved address may be used by templates and Events not yet started: ask the server, then confirm a replacement.
  const requestRemove = async (address: AddressDraft) => {
    if (!address.id) return remove(address.key);
    const usage = await churchSettingsApi
      .getChurchAddressUsage(address.id)
      .catch(() => undefined);
    if (!usage) {
      toast.error(m.church_settings_address_usage_failed());
      return;
    }
    if (usage.templates.length === 0 && usage.events.length === 0) {
      return remove(address.key);
    }
    setDeleting({ address, usage });
  };

  const confirmRemove = (replacementId: string | null) => {
    if (!deleting) return;
    const { id, key } = deleting.address;
    // Earlier deletions that named this address as replacement now follow its replacement.
    const kept = replacements.map((entry) =>
      entry.replacementAddressId === id
        ? { ...entry, replacementAddressId: replacementId }
        : entry,
    );
    onDelete({
      addresses: addresses.filter((address) => address.key !== key),
      replacements: id
        ? [...kept, { addressId: id, replacementAddressId: replacementId }]
        : kept,
    });
    setDeleting(undefined);
  };

  return (
    <div className="space-y-3">
      {addresses.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
          {m.church_settings_address_empty()}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {addresses.map((address, index) => {
            const name =
              address.label ??
              m.church_settings_address_untitled({ position: index + 1 });
            const own = rowErrors({ errors, index });
            const ownCount = Object.keys(own).length;
            const mainBlocked = address.isMain && addresses.length > 1;
            return (
              <li
                key={address.key}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3"
              >
                <div className="min-w-0 flex-1 basis-56">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-sm">
                    <span className="truncate">{name}</span>
                    {address.isMain ? (
                      <Badge>{m.church_settings_address_main_badge()}</Badge>
                    ) : null}
                  </p>
                  <p className="truncate text-muted-foreground text-sm">
                    {addressSummary({ address })}
                  </p>
                  {ownCount ? (
                    <p className="text-destructive text-sm" role="alert">
                      {ownCount === 1
                        ? m.church_settings_address_row_errors_one()
                        : m.church_settings_address_row_errors_many({
                            count: ownCount,
                          })}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    aria-label={m.church_settings_address_public_toggle({
                      name,
                    })}
                    checked={address.isPublic}
                    onCheckedChange={(isPublic) =>
                      update({ key: address.key, changes: { isPublic } })
                    }
                  />
                  <span className="w-14 text-muted-foreground text-xs">
                    {m.church_settings_address_public()}
                  </span>
                  {address.isMain ? null : (
                    <Button
                      variant="ghost"
                      size={sizes.small}
                      onClick={() => makeMain(address.key)}
                    >
                      {m.church_settings_address_make_main()}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size={sizes.icon}
                    aria-label={m.church_settings_address_move_up({ name })}
                    disabled={index === 0}
                    onClick={() => move({ index, by: -1 })}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size={sizes.icon}
                    aria-label={m.church_settings_address_move_down({ name })}
                    disabled={index === addresses.length - 1}
                    onClick={() => move({ index, by: 1 })}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size={sizes.icon}
                    aria-label={m.church_settings_address_edit({ name })}
                    onClick={() => setEditingKey(address.key)}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size={sizes.icon}
                    aria-label={m.church_settings_address_delete({ name })}
                    title={
                      mainBlocked
                        ? m.church_settings_address_delete_main_blocked()
                        : undefined
                    }
                    disabled={mainBlocked}
                    onClick={() => requestRemove(address)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Button variant="outline" onClick={() => setEditingKey(null)}>
        <Plus aria-hidden /> {m.church_settings_address_add()}
      </Button>
      {deleting ? (
        <DeleteInUseDialog
          address={deleting.address}
          usage={deleting.usage}
          options={addresses.filter(
            (address) => address.id && address.key !== deleting.address.key,
          )}
          onCancel={() => setDeleting(undefined)}
          onConfirm={confirmRemove}
        />
      ) : null}
      {editing === undefined ? null : (
        <AddressDialog
          key={editingKey ?? 'new'}
          editing={editing}
          errors={
            editing
              ? rowErrors({
                  errors,
                  index: addresses.findIndex((a) => a.key === editing.key),
                })
              : {}
          }
          onCancel={() => setEditingKey(undefined)}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}

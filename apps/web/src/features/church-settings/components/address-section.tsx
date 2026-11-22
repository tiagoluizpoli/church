import { m } from '@church/i18n/messages';
import { ArrowDown, ArrowUp, Home, Pencil, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { IconInputField } from '@/components/icon-input-field';
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
import { lookupCep, normalizeCep } from '@/features/church-settings/cep-client';
import {
  type AddressDraft,
  type AddressReplacement,
  addressSummary,
} from '@/features/church-settings/church-settings-form';
import {
  attachPlaceSearch,
  isMapsEnabled,
  type LatLng,
  mountPinMap,
  type PickedPlace,
  type PinMap,
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

interface AddressDialogProps {
  /** `undefined` closed, `null` adding, a draft editing it. */
  editing: AddressDraft | null | undefined;
  /** This row's refusals from the last save, by field name. */
  errors: FieldErrors;
  onCancel: () => void;
  onConfirm: (fields: DraftFields) => void;
}

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
  const [cepStatus, setCepStatus] = React.useState<
    'idle' | 'loading' | 'invalid' | 'notFound' | 'failed' | 'filled'
  >('idle');

  // Fills the same editable fields as manual entry; nothing is saved until the admin confirms.
  const searchCep = async () => {
    const cep = normalizeCep(fields.cep);
    if (!cep) return setCepStatus('invalid');
    setCepStatus('loading');
    try {
      const found = await lookupCep({ cep });
      if (!found) return setCepStatus('notFound');
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
        cep: found.cep || cep,
        street: found.street || current.street,
        bairro: found.bairro || current.bairro,
        city: found.city || current.city,
        uf: found.uf || current.uf,
      }));
      setCepStatus('filled');
    } catch {
      // Every failure reads the same to the admin: manual entry stays usable.
      setCepStatus('failed');
    }
  };
  const mapsEnabled = isMapsEnabled();
  const pin: LatLng | null =
    fields.latitude !== null && fields.longitude !== null
      ? { latitude: fields.latitude, longitude: fields.longitude }
      : null;
  // State, not refs: the dialog content mounts after the first effect pass.
  const [searchEl, setSearchEl] = React.useState<HTMLDivElement | null>(null);
  const [mapsFailed, setMapsFailed] = React.useState(false);
  const [mapEl, setMapEl] = React.useState<HTMLDivElement | null>(null);
  const pinMap = React.useRef<PinMap | null>(null);
  const initialPin = React.useRef(pin);

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
  };
  const dragged = React.useRef((moved: LatLng) =>
    setPin({ moved, pinSource: 'admin' }),
  );
  dragged.current = (moved) => setPin({ moved, pinSource: 'admin' });
  const picker = React.useRef(pick);
  picker.current = pick;

  React.useEffect(() => {
    if (!mapsEnabled || !searchEl || !mapEl) return;
    const failed = () => setMapsFailed(true);
    const detach = attachPlaceSearch({
      container: searchEl,
      label: m.church_settings_address_google_search(),
      onPick: (place) => picker.current(place),
      onError: failed,
    });
    const map = mountPinMap({
      element: mapEl,
      pin: initialPin.current,
      onDrag: (moved) => dragged.current(moved),
      onError: failed,
    });
    pinMap.current = map;
    return () => {
      detach();
      map.destroy();
      pinMap.current = null;
    };
  }, [mapsEnabled, searchEl, mapEl]);

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

  const cepMessage = {
    idle: null,
    loading: null,
    invalid: m.church_settings_address_cep_invalid(),
    notFound: m.church_settings_address_cep_not_found(),
    failed: m.church_settings_address_cep_failed(),
    filled: m.church_settings_address_cep_filled(),
  }[cepStatus];

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {adding
              ? m.church_settings_address_dialog_add()
              : m.church_settings_address_dialog_edit()}
          </DialogTitle>
          <DialogDescription>
            {m.church_settings_address_manual()}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
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
          <div className="sm:col-span-2">
            <IconInputField
              icon={Home}
              label={m.church_settings_address_street()}
              value={fields.street}
              error={errors.street}
              autoComplete="address-line1"
              onChange={(event) => set({ street: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <IconInputField
              icon={Home}
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
            icon={Home}
            label={m.church_settings_address_complement()}
            hint={m.church_settings_address_optional()}
            value={fields.complement}
            error={errors.complement}
            onChange={(event) => set({ complement: event.target.value })}
          />
          <IconInputField
            icon={Home}
            label={m.church_settings_address_bairro()}
            value={fields.bairro}
            error={errors.bairro}
            onChange={(event) => set({ bairro: event.target.value })}
          />
          <IconInputField
            icon={Home}
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
          <div className="space-y-2">
            <IconInputField
              icon={Home}
              label={m.church_settings_address_cep()}
              hint={m.church_settings_address_optional()}
              value={fields.cep}
              error={errors.cep}
              inputMode="numeric"
              autoComplete="postal-code"
              onChange={(event) => {
                set({ cep: event.target.value });
                setCepStatus('idle');
              }}
            />
            <Button
              type="button"
              variant="outline"
              size={sizes.small}
              disabled={cepStatus === 'loading'}
              onClick={searchCep}
            >
              {cepStatus === 'loading'
                ? m.church_settings_address_cep_lookup_loading()
                : m.church_settings_address_cep_lookup()}
            </Button>
            {cepMessage ? (
              <p
                className={
                  cepStatus === 'filled'
                    ? 'text-muted-foreground text-sm'
                    : 'text-destructive text-sm'
                }
                role={cepStatus === 'filled' ? 'status' : 'alert'}
              >
                {cepMessage}
              </p>
            ) : null}
          </div>
          {mapsEnabled ? (
            <div className="space-y-2 sm:col-span-2">
              <p className="font-medium text-sm">
                {m.church_settings_address_google_search()}
              </p>
              {/* Google's own search field (Places API New) mounts here. */}
              <div ref={setSearchEl} className="w-full" />
              {mapsFailed ? (
                <p role="alert" className="text-destructive text-sm">
                  {m.church_settings_address_maps_failed()}
                </p>
              ) : null}
              <p className="text-muted-foreground text-sm">
                {m.church_settings_address_google_search_hint()}
              </p>
              <p className="font-medium text-sm">
                {m.church_settings_address_pin_label()}
              </p>
              <div
                ref={setMapEl}
                role="application"
                aria-label={m.church_settings_address_pin_map()}
                className="h-56 w-full rounded-lg border bg-muted/30"
              />
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
                      onClick={() => setPin({ moved: pin, pinSource: 'admin' })}
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
          ) : null}
          <div className="space-y-2 sm:col-span-2">
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
            <p className="rounded-lg bg-muted/50 p-3 text-muted-foreground text-sm">
              {m.church_settings_address_home_note()}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            {m.church_settings_address_cancel()}
          </Button>
          <Button disabled={!complete} onClick={() => onConfirm(fields)}>
            {adding
              ? m.church_settings_address_confirm_add()
              : m.church_settings_address_confirm_edit()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

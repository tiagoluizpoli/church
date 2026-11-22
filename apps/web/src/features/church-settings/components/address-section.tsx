import { m } from '@church/i18n/messages';
import { ArrowDown, ArrowUp, Home, Pencil, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
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
import {
  type AddressDraft,
  addressSummary,
} from '@/features/church-settings/church-settings-form';

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
  };
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
          <IconInputField
            icon={Home}
            label={m.church_settings_address_cep()}
            hint={m.church_settings_address_optional()}
            value={fields.cep}
            error={errors.cep}
            inputMode="numeric"
            autoComplete="postal-code"
            onChange={(event) => set({ cep: event.target.value })}
          />
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
    latitude: previous?.latitude ?? null,
    longitude: previous?.longitude ?? null,
    pinSource: previous?.pinSource ?? null,
    placeId: previous?.placeId ?? null,
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

interface AddressSectionProps {
  addresses: AddressDraft[];
  errors: FieldErrors;
  onChange: (addresses: AddressDraft[]) => void;
}

/** The Church's addresses: a list staged into the screen's save bar, added and edited in a dialog. */
export function AddressSection({
  addresses,
  errors,
  onChange,
}: AddressSectionProps) {
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
                      size="sm"
                      onClick={() => makeMain(address.key)}
                    >
                      {m.church_settings_address_make_main()}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={m.church_settings_address_move_up({ name })}
                    disabled={index === 0}
                    onClick={() => move({ index, by: -1 })}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={m.church_settings_address_move_down({ name })}
                    disabled={index === addresses.length - 1}
                    onClick={() => move({ index, by: 1 })}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={m.church_settings_address_edit({ name })}
                    onClick={() => setEditingKey(address.key)}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={m.church_settings_address_delete({ name })}
                    title={
                      mainBlocked
                        ? m.church_settings_address_delete_main_blocked()
                        : undefined
                    }
                    disabled={mainBlocked}
                    onClick={() => remove(address.key)}
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

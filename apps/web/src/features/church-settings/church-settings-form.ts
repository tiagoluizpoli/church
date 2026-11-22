import type {
  GetChurchSettings200,
  UpdateChurchSettingsBody,
} from '@/infrastructure/api/churchAPI.schemas';

type AddressBody = UpdateChurchSettingsBody['addresses'][number];

/** One Church Address being edited; `key` is the row's stable React key (its id once saved). */
export type AddressDraft = Required<Omit<AddressBody, 'country' | 'id'>> & {
  key: string;
  id: string | null;
};

/** What the screen edits; the server normalises it on save. */
export interface ChurchSettingsForm {
  name: string;
  /** Empty means no website. */
  website: string;
  /** `null` means "Padrão do app". */
  accentColor: string | null;
  /** In display order; the server owns the rules on which is main. */
  addresses: AddressDraft[];
}

interface ToChurchSettingsFormInput {
  settings: GetChurchSettings200;
}

export function toChurchSettingsForm({
  settings,
}: ToChurchSettingsFormInput): ChurchSettingsForm {
  return {
    name: settings.name,
    website: settings.website ?? '',
    accentColor: settings.accentColor,
    addresses: settings.addresses.map(
      ({ id, country: _country, ...address }) => ({
        ...address,
        id,
        key: id,
      }),
    ),
  };
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

interface IsHexColorInput {
  value: string | null;
}

/** The typed accent when it is a complete `#rrggbb`, safe to paint with; otherwise `null`. */
export function paintableAccent({ value }: IsHexColorInput): string | null {
  return value !== null && HEX_COLOR.test(value) ? value : null;
}

interface ToSaveBodyInput {
  form: ChurchSettingsForm;
}

/** The PUT body: the draft rows without their React keys. */
export function toSaveBody({
  form,
}: ToSaveBodyInput): UpdateChurchSettingsBody {
  return {
    ...form,
    addresses: form.addresses.map(({ key: _key, ...address }) => address),
  };
}

/** `Rua A, 120 · Centro · Campinas/SP`, one line. */
interface AddressSummaryInput {
  address: AddressDraft;
}

export function addressSummary({ address }: AddressSummaryInput): string {
  const line = [address.street, address.number].join(', ');
  const complement = address.complement ? ` – ${address.complement}` : '';
  return `${line}${complement} · ${address.bairro} · ${address.city}/${address.uf}`;
}

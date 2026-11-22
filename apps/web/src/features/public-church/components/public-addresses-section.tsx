import { m } from '@church/i18n/messages';
import { toast } from 'sonner';
import {
  detectDevice,
  directionsLink,
  formatAddress,
} from '@/features/church-settings/directions';
import type { GetPublicChurchProfile200AddressesItem } from '@/infrastructure/api/churchAPI.schemas';

type PublicAddress = GetPublicChurchProfile200AddressesItem;

const MAPS_EMBED_URL = 'https://www.google.com/maps/embed/v1/place';

interface PublicAddressesSectionProps {
  /** The public addresses, Main first. */
  addresses: PublicAddress[];
  /** Without a key there is no map; the addresses and links still show. */
  mapsEmbedKey: string | undefined;
}

/** The Main Address map and every public address with *Como chegar*; hidden when none is public. */
export function PublicAddressesSection({
  addresses,
  mapsEmbedKey,
}: PublicAddressesSectionProps) {
  const [main] = addresses;
  if (!main) return null;
  return (
    <section aria-labelledby="public-addresses-title" className="mt-8">
      <h2
        id="public-addresses-title"
        className="font-semibold text-xl tracking-tight"
      >
        {m.public_addresses_title()}
      </h2>
      {mapsEmbedKey && main.isMain ? (
        <iframe
          title={m.public_addresses_map_title()}
          src={mapSrc({ address: main, key: mapsEmbedKey })}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="mt-4 h-64 w-full rounded-md border"
        />
      ) : null}
      <ul className="mt-4 flex flex-col gap-4">
        {addresses.map((address) => (
          <li key={`${address.street}-${address.number}-${address.label}`}>
            <p className="font-medium">{address.label ?? address.street}</p>
            <p className="text-muted-foreground">
              {formatAddress({ address })}
            </p>
            <AddressActions address={address} />
          </li>
        ))}
      </ul>
    </section>
  );
}

interface MapSrcInput {
  address: PublicAddress;
  key: string;
}

function mapSrc({ address, key }: MapSrcInput): string {
  const query = address.placeId
    ? `place_id:${address.placeId}`
    : encodeURIComponent(formatAddress({ address }));
  return `${MAPS_EMBED_URL}?key=${encodeURIComponent(key)}&q=${query}`;
}

interface AddressActionsProps {
  address: PublicAddress;
}

function AddressActions({ address }: AddressActionsProps) {
  const copy = async () => {
    await navigator.clipboard.writeText(formatAddress({ address }));
    toast.success(m.church_settings_preview_address_copied());
  };
  return (
    <div className="mt-1 flex flex-wrap gap-3">
      <a
        href={directionsLink({
          address,
          device: detectDevice({ userAgent: navigator.userAgent }),
        })}
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {m.church_settings_preview_directions()}
      </a>
      <button
        type="button"
        onClick={copy}
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {m.church_settings_preview_copy_address()}
      </button>
    </div>
  );
}

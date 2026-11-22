import { m } from '@church/i18n/messages';
import type { GetPublicChurchProfile200AddressesItem } from '@/infrastructure/api/churchAPI.schemas';
import { AddressActions } from '@/shared/components/address-actions';
import { formatAddress } from '@/shared/utils/directions';

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
            <AddressActions address={address} className="mt-1" />
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

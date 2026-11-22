import {
  detectDevice,
  directionsLink,
  formatAddress,
} from '@church/app-config/directions';
import { SOCIAL_NETWORKS } from '@church/app-config/social-networks';
import { m } from '@church/i18n/messages';
import { toast } from 'sonner';
import { accentTextColor } from '@/features/church-settings/accent-text-color';
import {
  type ChurchSettingsForm,
  paintableAccent,
} from '@/features/church-settings/church-settings-form';
import { LogoImage } from '@/features/church-settings/components/logo-image';
import { detectedNetwork } from '@/features/church-settings/components/social-section';

interface ChurchPreviewProps {
  form: ChurchSettingsForm;
  /** Applied at once, so it comes from the saved settings, not the form. */
  logoUrl: string | null;
  /** Set when the preview names itself (beside the sections); the drawer names it instead. */
  titleId?: string;
}

/** "Como sua igreja aparece": the public face as the form stands, empty fields left out. */
export function ChurchPreview({ form, logoUrl, titleId }: ChurchPreviewProps) {
  const accent = paintableAccent({ value: form.accentColor });
  const band = accent
    ? { background: accent, color: accentTextColor({ accentColor: accent }) }
    : undefined;
  const website = form.website.trim().replace(/^https?:\/\//i, '');
  const name = form.name.trim();
  // The Main Address leads; private addresses are never shown to visitors.
  const publicAddresses = form.addresses
    .filter((address) => address.isPublic)
    .sort((a, b) => Number(b.isMain) - Number(a.isMain));
  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      {titleId ? (
        <h2 id={titleId} className="border-b px-4 py-3 font-semibold text-base">
          {m.church_settings_preview_title()}
        </h2>
      ) : null}
      <p className="px-4 pt-3 font-medium text-muted-foreground text-xs">
        {m.church_settings_preview_email()}
      </p>
      <div
        data-testid="church-preview-email-band"
        className={
          accent
            ? 'flex items-center gap-3 p-4'
            : 'flex items-center gap-3 bg-primary p-4 text-primary-foreground'
        }
        style={band}
      >
        {logoUrl ? (
          <span className="flex h-10 w-24 shrink-0 items-center justify-center rounded-md bg-white p-1">
            <LogoImage logoUrl={logoUrl} className="h-full w-full" />
          </span>
        ) : (
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-md bg-background/90 font-semibold text-foreground"
          >
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          {name ? <p className="truncate font-semibold">{name}</p> : null}
          {website ? (
            <p className="truncate text-sm opacity-90">{website}</p>
          ) : null}
        </div>
      </div>
      {publicAddresses.length > 0 ? (
        <div className="space-y-2 border-t p-4">
          <p className="font-medium text-muted-foreground text-xs">
            {m.church_settings_preview_addresses()}
          </p>
          <ul className="space-y-3 text-sm">
            {publicAddresses.map((address) => (
              <li key={address.key} className="space-y-1">
                <p className="font-medium">{address.label ?? address.street}</p>
                <p className="text-muted-foreground">
                  {formatAddress({ address })}
                </p>
                <AddressActions address={address} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {form.socialLinks.length > 0 ? (
        <div className="space-y-1.5 border-t p-4">
          <p className="font-medium text-muted-foreground text-xs">
            {m.church_settings_preview_social()}
          </p>
          <ul className="space-y-1 text-sm">
            {form.socialLinks.map((link) => {
              const network = detectedNetwork({ url: link.url });
              return (
                <li key={link.key} className="truncate">
                  <span className="font-medium">
                    {network ? SOCIAL_NETWORKS[network].label : link.url}
                  </span>
                  {link.description.trim() ? (
                    <span className="text-muted-foreground">
                      {' · '}
                      {link.description.trim()}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {logoUrl ? (
        <div className="grid grid-cols-2 gap-3 border-t p-4">
          <LogoTile logoUrl={logoUrl} dark={false} />
          <LogoTile logoUrl={logoUrl} dark />
        </div>
      ) : null}
    </div>
  );
}

interface LogoTileProps {
  logoUrl: string;
  dark: boolean;
}

/** The logo on the app's logo tile, painted as in light or dark mode. */
function LogoTile({ logoUrl, dark }: LogoTileProps) {
  const label = dark
    ? m.church_settings_preview_logo_dark()
    : m.church_settings_preview_logo_light();
  return (
    <figure className="space-y-1.5">
      <div
        data-testid={
          dark ? 'church-preview-logo-dark' : 'church-preview-logo-light'
        }
        className={
          dark
            ? 'flex h-16 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 p-2'
            : 'flex h-16 items-center justify-center rounded-md border bg-white p-2'
        }
      >
        <LogoImage logoUrl={logoUrl} className="h-full w-full" />
      </div>
      <figcaption className="text-center text-muted-foreground text-xs">
        {label}
      </figcaption>
    </figure>
  );
}

interface AddressActionsProps {
  address: ChurchSettingsForm['addresses'][number];
}

/** *Como chegar* for the visitor's device and *Copiar endereço*. */
function AddressActions({ address }: AddressActionsProps) {
  const copy = async () => {
    await navigator.clipboard.writeText(formatAddress({ address }));
    toast.success(m.church_settings_preview_address_copied());
  };
  return (
    <div className="flex flex-wrap gap-3">
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

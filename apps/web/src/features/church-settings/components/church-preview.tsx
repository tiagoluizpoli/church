import { SOCIAL_NETWORKS } from '@church/app-config/social-networks';
import { m } from '@church/i18n/messages';
import { accentTextColor } from '@/features/church-settings/accent-text-color';
import type { ContactForm } from '@/features/church-settings/church-settings-form';
import {
  type ChurchSettingsForm,
  formatCnpj,
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
      <PreviewContacts
        title={m.church_settings_preview_public_contacts()}
        contacts={form.contacts.filter(({ isPublic }) => isPublic)}
        testId="church-preview-public-contacts"
      />
      <PreviewContacts
        title={m.church_settings_preview_admin_contacts()}
        contacts={form.contacts.filter(({ isPublic }) => !isPublic)}
        testId="church-preview-admin-contacts"
      />
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
      {form.legalProfile.isPublic &&
      (form.legalProfile.legalName.trim() || form.legalProfile.cnpj.trim()) ? (
        <div className="space-y-1 border-t p-4 text-sm">
          <p className="font-medium text-muted-foreground text-xs">
            {m.church_settings_preview_legal()}
          </p>
          {form.legalProfile.legalName.trim() ? (
            <p>{form.legalProfile.legalName.trim()}</p>
          ) : null}
          {form.legalProfile.cnpj.trim() ? (
            <p>CNPJ {formatCnpj({ digits: form.legalProfile.cnpj.trim() })}</p>
          ) : null}
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

interface PreviewContactsProps {
  title: string;
  contacts: ContactForm[];
  testId: string;
}

/** One list of contacts in the preview; nothing renders while it is empty. */
function PreviewContacts({ title, contacts, testId }: PreviewContactsProps) {
  const filled = contacts.filter(({ value }) => value.trim() !== '');
  if (filled.length === 0) return null;
  return (
    <div data-testid={testId} className="space-y-1 border-t p-4">
      <p className="font-medium text-muted-foreground text-xs">{title}</p>
      <ul className="space-y-0.5 text-sm">
        {filled.map(({ key, value, description }) => (
          <li key={key} className="truncate">
            {value}
            {description ? (
              <span className="text-muted-foreground"> · {description}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

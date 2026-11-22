import { SOCIAL_NETWORKS } from '@church/domain-rules/social-networks';
import { m } from '@church/i18n/messages';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { accentTextColor } from '@/features/church-settings/accent-text-color';
import type {
  ContactForm,
  SocialLinkDraft,
} from '@/features/church-settings/church-settings-form';
import {
  type ChurchSettingsForm,
  formatCnpj,
  paintableAccent,
} from '@/features/church-settings/church-settings-form';
import { LogoImage } from '@/features/church-settings/components/logo-image';
import { detectedNetwork } from '@/features/church-settings/components/social-section';
import {
  groupOrder,
  membersOf,
  moveGroup,
  renameGroup,
} from '@/features/church-settings/contact-groups';
import { AddressActions } from '@/shared/components/address-actions';
import { formatAddress } from '@/shared/utils/directions';

interface ChurchPreviewProps {
  form: ChurchSettingsForm;
  /** Applied at once, so it comes from the saved settings, not the form. */
  logoUrl: string | null;
  /** Set when the preview names itself (beside the sections); the drawer names it instead. */
  titleId?: string;
  /** Renaming or reordering a Contact Group edits the form from here. */
  onChange: (changes: Partial<ChurchSettingsForm>) => void;
}

/** "Como sua igreja aparece": the public face as the form stands, empty fields left out. */
export function ChurchPreview({
  form,
  logoUrl,
  titleId,
  onChange,
}: ChurchPreviewProps) {
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
      <PreviewPublic form={form} onChange={onChange} />
      <PreviewContacts
        title={m.church_settings_preview_admin_contacts()}
        contacts={form.contacts.filter(({ isPublic }) => !isPublic)}
        testId="church-preview-admin-contacts"
      />
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
            <p>
              {m.church_settings_legal_cnpj_label()}{' '}
              {formatCnpj({ digits: form.legalProfile.cnpj.trim() })}
            </p>
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

interface PreviewPublicProps {
  form: ChurchSettingsForm;
  onChange: ChurchPreviewProps['onChange'];
}

/** What the public sees: contacts and links together per group, "Da igreja" (ungrouped) first. */
function PreviewPublic({ form, onChange }: PreviewPublicProps) {
  const order = groupOrder({ form });
  const contacts = form.contacts.filter(
    ({ isPublic, value }) => isPublic && value.trim() !== '',
  );
  const links = form.socialLinks.filter(({ url }) => url.trim() !== '');
  const blocks = [null, ...order].filter(
    (name) =>
      membersOf({ rows: contacts, name }).length +
        membersOf({ rows: links, name }).length >
      0,
  );
  if (blocks.length === 0) return null;
  return (
    <div data-testid="church-preview-public-contacts" className="border-t">
      <p className="px-4 pt-3 font-medium text-muted-foreground text-xs">
        {m.church_settings_preview_public_contacts()}
      </p>
      {blocks.map((name) => (
        <div
          key={name ?? ''}
          data-testid="church-preview-group"
          className="space-y-1 p-4 pt-2"
        >
          {name === null ? (
            <p className="font-semibold text-sm">
              {m.church_settings_preview_group_church()}
            </p>
          ) : (
            <GroupHeading
              form={form}
              name={name}
              position={order.indexOf(name)}
              count={order.length}
              onChange={onChange}
            />
          )}
          <ul className="space-y-0.5 text-sm">
            {membersOf({ rows: contacts, name }).map((contact) => (
              <li key={contact.key} className="truncate">
                {contact.value}
                {contact.description ? (
                  <span className="text-muted-foreground">
                    {' · '}
                    {contact.description}
                  </span>
                ) : null}
              </li>
            ))}
            {membersOf({ rows: links, name }).map((link) => (
              <PreviewLink key={link.key} link={link} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

interface PreviewLinkProps {
  link: SocialLinkDraft;
}

function PreviewLink({ link }: PreviewLinkProps) {
  const network = detectedNetwork({ url: link.url });
  const description = link.description.trim();
  return (
    <li className="truncate">
      <span className="font-medium">
        {network ? SOCIAL_NETWORKS[network].label : link.url}
      </span>
      {description ? (
        <span className="text-muted-foreground">
          {' · '}
          {description}
        </span>
      ) : null}
    </li>
  );
}

interface GroupHeadingProps {
  form: ChurchSettingsForm;
  name: string;
  /** Among the named groups, not counting those with no public row. */
  position: number;
  count: number;
  onChange: ChurchPreviewProps['onChange'];
}

/** A group's name, renamed on blur or Enter, with move controls. */
function GroupHeading({
  form,
  name,
  position,
  count,
  onChange,
}: GroupHeadingProps) {
  const commit = (to: string) => {
    if (to.trim() !== '' && to !== name)
      onChange(renameGroup({ form, from: name, to }));
  };
  return (
    <div className="flex items-center gap-1">
      <Input
        key={name}
        defaultValue={name}
        aria-label={m.church_settings_preview_group_rename({ name })}
        className="h-8 font-semibold text-sm"
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <Button
        variant="ghost"
        size="icon"
        disabled={position === 0}
        aria-label={m.church_settings_preview_group_move_up({ name })}
        onClick={() =>
          onChange({ contactGroups: moveGroup({ form, name, by: -1 }) })
        }
      >
        <ArrowUp aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={position === count - 1}
        aria-label={m.church_settings_preview_group_move_down({ name })}
        onClick={() =>
          onChange({ contactGroups: moveGroup({ form, name, by: 1 }) })
        }
      >
        <ArrowDown aria-hidden />
      </Button>
    </div>
  );
}

import {
  EMAIL_INK,
  EMAIL_LOGO_RADIUS,
  EMAIL_RULE_WIDTH,
  emailAccentRule,
  emailAccentTint,
  PLATFORM_ACCENT,
} from '@church/domain-rules/email-accent';
import { SOCIAL_NETWORKS } from '@church/domain-rules/social-networks';
import { m } from '@church/i18n/messages';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { ChurchLogoTile } from '@/components/church-logo-tile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  ContactForm,
  SocialLinkDraft,
} from '@/features/church-settings/church-settings-form';
import {
  type ChurchSettingsForm,
  formatCnpj,
  paintableAccent,
} from '@/features/church-settings/church-settings-form';
import { detectedNetwork } from '@/features/church-settings/components/social-section';
import {
  groupOrder,
  membersOf,
  moveGroup,
  renameGroup,
} from '@/features/church-settings/contact-groups';
import { useControlSizes } from '@/features/church-settings/use-control-sizes';
import { cn } from '@/lib/utils';
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
  // The same header as the real email: the accent as tint and top rule, ink text.
  const bandAccent = accent ?? PLATFORM_ACCENT;
  const band = {
    background: emailAccentTint(bandAccent),
    borderTop: `${EMAIL_RULE_WIDTH}px solid ${emailAccentRule(bandAccent)}`,
    color: EMAIL_INK,
  };
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
        className="flex flex-col items-center gap-3 px-6 py-7 text-center"
        style={band}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={m.church_settings_logo_alt()}
            className="max-h-14 max-w-48 object-contain"
            style={{ borderRadius: EMAIL_LOGO_RADIUS }}
          />
        ) : null}
        <div className="min-w-0 max-w-full">
          {name ? (
            <p
              className={cn(
                'truncate',
                logoUrl ? 'font-semibold text-sm' : 'font-bold text-xl',
              )}
            >
              {name}
            </p>
          ) : null}
          {website ? <p className="truncate text-sm">{website}</p> : null}
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
          <LogoTile name={name} logoUrl={logoUrl} dark={false} />
          <LogoTile name={name} logoUrl={logoUrl} dark />
        </div>
      ) : null}
    </div>
  );
}

interface LogoTileProps {
  name: string;
  logoUrl: string;
  dark: boolean;
}

/** The app's own logo tile (near-white in both themes) on a light or a dark surface. */
function LogoTile({ name, logoUrl, dark }: LogoTileProps) {
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
            : 'flex h-16 items-center justify-center rounded-md border bg-sidebar p-2'
        }
      >
        <ChurchLogoTile name={name} logoUrl={logoUrl} size="desktop" />
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
  const publicRows = (name: string | null) =>
    membersOf({ rows: contacts, name }).length +
    membersOf({ rows: links, name }).length;
  // Every named group gets its block, so one of only private contacts can
  // still be renamed and moved, and a move never swaps with a hidden group.
  const blocks = [...(publicRows(null) > 0 ? [null] : []), ...order];
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
          {publicRows(name) === 0 ? (
            <p className="text-muted-foreground text-sm">
              {m.church_settings_preview_group_private_only()}
            </p>
          ) : null}
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
  /** Among every named group. */
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
  const sizes = useControlSizes();
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
        className={cn('font-semibold text-sm', !sizes.touch && 'h-8')}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <Button
        variant="ghost"
        size={sizes.icon}
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
        size={sizes.icon}
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

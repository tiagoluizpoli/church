import { SOCIAL_NETWORKS } from '@church/domain-rules/social-networks';
import { m } from '@church/i18n/messages';
import { networkIcon } from '@/components/social-network-icons';
import type { GetPublicChurchProfile200 } from '@/infrastructure/api/churchAPI.schemas';

type ContactGroup = GetPublicChurchProfile200['contactGroups'][number];
type Contact = ContactGroup['contacts'][number];

const BRAZIL_CALLING_CODE = '55';
const AREA_CODE_DIGITS = 2;
/** `(11) 99999-0000`: the hyphen sits before the last four digits. */
const LINE_TAIL_DIGITS = 4;

interface ContactTargetInput {
  contact: Contact;
}

/** The link that opens the right app; a mobile phone is a WhatsApp chat when marked. */
function contactTarget({ contact }: ContactTargetInput) {
  if (contact.kind === 'email') {
    return { href: `mailto:${contact.value}`, label: contact.value };
  }
  const digits = contact.value.replace(/\D/g, '');
  const national = digits.startsWith(BRAZIL_CALLING_CODE)
    ? digits.slice(BRAZIL_CALLING_CODE.length)
    : digits;
  const area = national.slice(0, AREA_CODE_DIGITS);
  const rest = national.slice(AREA_CODE_DIGITS);
  const split = rest.length - LINE_TAIL_DIGITS;
  return {
    href: contact.isWhatsApp
      ? `https://wa.me/${digits}`
      : `tel:${contact.value}`,
    label: `(${area}) ${rest.slice(0, split)}-${rest.slice(split)}`,
  };
}

interface PublicContactsSectionProps {
  contactGroups: GetPublicChurchProfile200['contactGroups'];
}

/** Public contacts and Social Links in the server's group order; hidden when empty. */
export function PublicContactsSection({
  contactGroups,
}: PublicContactsSectionProps) {
  if (contactGroups.length === 0) return null;
  return (
    <section aria-labelledby="public-contacts-title" className="mt-8">
      <h2
        id="public-contacts-title"
        className="font-semibold text-xl tracking-tight"
      >
        {m.public_contacts_title()}
      </h2>
      <div className="mt-4 flex flex-col gap-4">
        {contactGroups.map(({ name, contacts, socialLinks }) => (
          <div key={name ?? ''}>
            <h3 className="font-medium text-muted-foreground text-sm">
              {name ?? m.church_settings_preview_group_church()}
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {contacts.map((contact) => {
                const { href, label } = contactTarget({ contact });
                return (
                  <li key={contact.value} className="flex flex-wrap gap-x-3">
                    <a
                      href={href}
                      className="underline-offset-4 hover:underline"
                    >
                      {label}
                      {contact.isWhatsApp ? (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">
                          {m.public_contacts_whatsapp()}
                        </span>
                      ) : null}
                      {contact.description ? (
                        <span className="text-muted-foreground">
                          {' · '}
                          {contact.description}
                        </span>
                      ) : null}
                    </a>
                    {/* A WhatsApp number is a phone too: calling stays one tap away. */}
                    {contact.isWhatsApp ? (
                      <a
                        href={`tel:${contact.value}`}
                        aria-label={m.public_contacts_call({ number: label })}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {m.public_contacts_call_short()}
                      </a>
                    ) : null}
                  </li>
                );
              })}
              {socialLinks.map(({ url, network, description }) => {
                const Icon = networkIcon({ network });
                const known =
                  SOCIAL_NETWORKS[network as keyof typeof SOCIAL_NETWORKS];
                return (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 underline-offset-4 hover:underline"
                    >
                      <Icon aria-hidden className="size-4" />
                      {known?.label ?? network}
                      {description ? (
                        <span className="text-muted-foreground">
                          {' · '}
                          {description}
                        </span>
                      ) : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

import { m } from '@church/i18n/messages';

interface PreparationCatalogPrerequisitesProps {
  ministryId: string;
  hasSectors: boolean;
  hasRoles: boolean;
}

/** Open the registry alongside the draft; focus refreshes the choices. */
export function PreparationCatalogPrerequisites({
  ministryId,
  hasSectors,
  hasRoles,
}: PreparationCatalogPrerequisitesProps) {
  const missing = [
    !hasSectors && {
      text: m.usual_setup_missing_sectors(),
      href: `/ministries/${ministryId}/sectors`,
      link: m.prepare_set_up_sectors(),
    },
    !hasRoles && {
      text: m.usual_setup_missing_roles(),
      href: `/ministries/${ministryId}/roles`,
      link: m.usual_setup_set_up_roles(),
    },
  ].filter((item) => item !== false);
  return missing.map((item) => (
    <p key={item.href} className="text-muted-foreground text-sm" role="status">
      {item.text}{' '}
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
      >
        {item.link}
        <span className="sr-only"> {m.sectors_opens_new_tab()}</span>
      </a>
    </p>
  ));
}

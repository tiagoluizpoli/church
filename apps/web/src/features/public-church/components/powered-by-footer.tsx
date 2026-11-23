import { m } from '@church/i18n/messages';

interface PoweredByFooterProps {
  appName: string;
  /** The platform's own site; without it the credit is plain text. */
  platformSiteUrl: string | undefined;
}

/** The muted "Desenvolvido com {appName}" credit at the foot of a Public Church Profile. */
export function PoweredByFooter({
  appName,
  platformSiteUrl,
}: PoweredByFooterProps) {
  const credit = m.public_church_powered_by({ appName });
  return (
    <footer className="py-6 text-center text-muted-foreground text-xs">
      {platformSiteUrl ? (
        <a
          href={platformSiteUrl}
          className="underline-offset-4 hover:underline"
        >
          {credit}
        </a>
      ) : (
        credit
      )}
    </footer>
  );
}

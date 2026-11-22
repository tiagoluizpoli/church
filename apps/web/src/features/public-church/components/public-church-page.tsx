import { appConfig } from '@church/app-config';
import { m } from '@church/i18n/messages';
import { PoweredByFooter } from './powered-by-footer';
import { PublicContactsSection } from './public-contacts-section';
import { PublicEventsSection } from './public-events-section';
import { PublicLegalSection } from './public-legal-section';
import { PublicProgrammeSection } from './public-programme-section';
import type { GetPublicChurchProfile200 } from '@/infrastructure/api/churchAPI.schemas';

interface PublicChurchPageProps {
  profile: GetPublicChurchProfile200;
}

/** The Public Church Profile: identity on top, the platform credit below. Sections join later. */
export function PublicChurchPage({ profile }: PublicChurchPageProps) {
  const accent = profile.accentColor ?? undefined;
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <div
        aria-hidden
        className="h-1.5 w-full bg-primary"
        style={accent ? { backgroundColor: accent } : undefined}
      />
      <main className="flex-1 px-4 py-8 sm:px-6">
        <header className="flex items-center gap-4">
          {profile.logoUrl ? (
            <img
              src={profile.logoUrl}
              alt={m.public_church_logo_alt({ name: profile.name })}
              className="size-16 shrink-0 rounded-md border bg-white object-contain p-1 sm:size-20"
            />
          ) : null}
          <h1
            className="border-primary border-l-4 pl-3 font-semibold text-2xl tracking-tight sm:text-3xl"
            style={accent ? { borderColor: accent } : undefined}
          >
            {profile.name}
          </h1>
        </header>
        <PublicProgrammeSection programme={profile.programme} />
        <PublicEventsSection slug={profile.slug} />
        <PublicContactsSection contactGroups={profile.contactGroups} />
        <PublicLegalSection legalProfile={profile.legalProfile} />
      </main>
      <PoweredByFooter
        appName={appConfig.appName}
        platformSiteUrl={appConfig.platformSiteUrl}
      />
    </div>
  );
}

/** A wrong or never-held slug. */
export function PublicChurchNotFound() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <main className="flex flex-1 flex-col gap-2 px-4 py-12 sm:px-6">
        <h1 className="font-semibold text-2xl tracking-tight">
          {m.public_church_not_found_title()}
        </h1>
        <p className="text-muted-foreground">
          {m.public_church_not_found_description()}
        </p>
      </main>
      <PoweredByFooter
        appName={appConfig.appName}
        platformSiteUrl={appConfig.platformSiteUrl}
      />
    </div>
  );
}

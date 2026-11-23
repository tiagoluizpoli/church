import { appConfig } from '@church/app-config';
import { env } from '@church/env/web';
import { m } from '@church/i18n/messages';
import { PoweredByFooter } from './powered-by-footer';
import { PublicAddressesSection } from './public-addresses-section';
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
  const area = profile.mainAddressArea;
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
          <div
            className="border-primary border-l-4 pl-3"
            style={accent ? { borderColor: accent } : undefined}
          >
            <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
              {profile.name}
            </h1>
            {/* Shown even for a private Main Address: only bairro and city/UF. */}
            {area ? (
              <p className="text-muted-foreground text-sm">
                {`${area.bairro} · ${area.city}/${area.uf}`}
              </p>
            ) : null}
          </div>
        </header>
        {/* #1001 order: contacts with Social Links, legal, addresses, programme, events. */}
        <PublicContactsSection contactGroups={profile.contactGroups} />
        <PublicLegalSection legalProfile={profile.legalProfile} />
        <PublicAddressesSection
          addresses={profile.addresses}
          mapsEmbedKey={env.VITE_GOOGLE_MAPS_EMBED_KEY}
        />
        <PublicProgrammeSection programme={profile.programme} />
        <PublicEventsSection slug={profile.slug} />
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

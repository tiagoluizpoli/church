// PROTOTYPE, throwaway: three structurally different Church Settings layouts (wayfinder #980).
//   A  Single page: stacked section panels, sticky save bar that appears when something changed.
//   B  Section rail: one section at a time, left rail with error counts, save in the header.
//   C  Live preview: edit on the left, "how your church appears" on the right, public vs private split.
import {
  AlertCircle,
  ChevronDown,
  Globe,
  Lock,
  Mail,
  MessageCircle,
  Phone,
} from 'lucide-react';
import * as React from 'react';
import {
  AccentPicker,
  AddressSlot,
  ContactsEditor,
  LegalEditor,
  LogoControl,
  LogoMark,
  NameField,
  ProgrammeHint,
  SaveButtons,
  SlugConfirm,
  SlugField,
  SocialLinksEditor,
  WebsiteField,
} from './prototype-editors';
import {
  detectNetwork,
  type SettingsController,
  textOn,
} from './prototype-state';
import { VariantC } from './prototype-variant-c';
import { Badge } from '@/components/ui/badge';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { cn } from '@/lib/utils';

const INTRO =
  'A identidade da sua igreja: aparece no app, nos e-mails e na página pública.';

function Section({
  id,
  title,
  description,
  aside,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="surface-panel space-y-4 p-4 md:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-lg">{title}</h2>
          {description ? (
            <p className="text-muted-foreground text-sm">{description}</p>
          ) : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

const errorsIn = (c: SettingsController, prefix: string) =>
  Object.keys(c.errors).filter((k) => k.startsWith(prefix)).length;

function ErrorBanner({ c }: { c: SettingsController }) {
  if (!c.errorCount) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm">
      <AlertCircle className="size-4" />
      Nada foi salvo. Corrija {c.errorCount}{' '}
      {c.errorCount === 1 ? 'campo' : 'campos'} marcados abaixo.
    </div>
  );
}

// ─── A: single page ─────────────────────────────────────────────
export function VariantA({ c }: { c: SettingsController }) {
  return (
    <WorkspacePage className="pb-24">
      <WorkspaceIntroPanel
        title="Configurações da igreja"
        description={INTRO}
      />
      <ErrorBanner c={c} />
      <Section
        title="Logo"
        description="Salvo na hora, separado do restante do formulário."
      >
        <LogoControl c={c} />
      </Section>
      <Section title="Identidade">
        <div className="grid gap-4 lg:grid-cols-2">
          <NameField c={c} />
          <SlugField c={c} />
          <WebsiteField c={c} />
        </div>
        <AccentPicker c={c} />
      </Section>
      <Section
        title="Contatos"
        description="Privados por padrão. Arraste para ordenar."
      >
        <ContactsEditor c={c} />
      </Section>
      <Section
        title="Redes sociais"
        description="Sempre públicas. A rede é reconhecida pelo endereço."
      >
        <SocialLinksEditor c={c} />
      </Section>
      <Section title="Dados jurídicos" description="Privados por padrão.">
        <LegalEditor c={c} />
      </Section>
      <Section title="Endereço">
        <AddressSlot />
      </Section>
      <ProgrammeHint />
      <div
        className={cn(
          'fixed inset-x-0 bottom-16 z-40 mx-auto flex w-fit items-center gap-4 rounded-xl border bg-background p-2 pl-4 shadow-lg transition',
          c.dirty
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-4 opacity-0',
        )}
      >
        <span className="text-sm">Alterações não salvas</span>
        <SaveButtons c={c} />
      </div>
      <SlugConfirm c={c} />
    </WorkspacePage>
  );
}

// ─── B: section rail ────────────────────────────────────────────
const RAIL = [
  { key: 'identity', label: 'Identidade', prefix: 'name|slug|website' },
  { key: 'logo', label: 'Logo', prefix: 'logo' },
  { key: 'contacts', label: 'Contatos', prefix: 'contacts.' },
  { key: 'links', label: 'Redes sociais', prefix: 'links.' },
  { key: 'legal', label: 'Dados jurídicos', prefix: 'legal.' },
  { key: 'address', label: 'Endereço', prefix: 'address' },
] as const;

export function VariantB({ c }: { c: SettingsController }) {
  const [tab, setTab] =
    React.useState<(typeof RAIL)[number]['key']>('identity');
  const count = (prefix: string) =>
    prefix.split('|').reduce((n, p) => n + errorsIn(c, p), 0);
  return (
    <WorkspacePage>
      <WorkspaceIntroPanel
        title="Configurações da igreja"
        description={INTRO}
        aside={<SaveButtons c={c} />}
      />
      <ErrorBanner c={c} />
      <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
        <nav className="surface-panel flex gap-1 overflow-x-auto p-2 md:flex-col">
          {RAIL.map((r) => {
            const n = count(r.prefix);
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setTab(r.key)}
                className={cn(
                  'flex shrink-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm',
                  tab === r.key ? 'bg-muted font-medium' : 'hover:bg-muted/60',
                )}
              >
                {r.label}
                {n ? <Badge variant="destructive">{n}</Badge> : null}
              </button>
            );
          })}
        </nav>
        <div className="space-y-4">
          {tab === 'identity' ? (
            <Section title="Identidade">
              <div className="grid gap-4 lg:grid-cols-2">
                <NameField c={c} />
                <SlugField c={c} />
                <WebsiteField c={c} />
              </div>
              <AccentPicker c={c} />
            </Section>
          ) : null}
          {tab === 'logo' ? (
            <Section
              title="Logo"
              description="Salvo na hora; não depende de “Salvar alterações”."
            >
              <LogoControl c={c} />
            </Section>
          ) : null}
          {tab === 'contacts' ? (
            <Section title="Contatos" description="Privados por padrão.">
              <ContactsEditor c={c} />
            </Section>
          ) : null}
          {tab === 'links' ? (
            <Section title="Redes sociais" description="Sempre públicas.">
              <SocialLinksEditor c={c} />
            </Section>
          ) : null}
          {tab === 'legal' ? (
            <Section title="Dados jurídicos" description="Privados por padrão.">
              <LegalEditor c={c} />
            </Section>
          ) : null}
          {tab === 'address' ? (
            <Section title="Endereço">
              <AddressSlot />
            </Section>
          ) : null}
        </div>
      </div>
      <SlugConfirm c={c} />
    </WorkspacePage>
  );
}

export const VARIANTS = {
  A: { name: 'Página única', Component: VariantA },
  B: { name: 'Seções laterais', Component: VariantB },
  C: { name: 'Prévia ao vivo (rodada 2)', Component: VariantC },
} as const;

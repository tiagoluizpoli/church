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

// ─── C: live preview ────────────────────────────────────────────
function Collapsible({
  title,
  summary,
  errors,
  defaultOpen,
  children,
}: {
  title: string;
  summary: string;
  errors: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  React.useEffect(() => {
    if (errors) setOpen(true);
  }, [errors]);
  return (
    <section className="surface-panel">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          <p className="truncate text-muted-foreground text-sm">{summary}</p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {errors ? <Badge variant="destructive">{errors}</Badge> : null}
          <ChevronDown
            className={cn('size-4 transition', open && 'rotate-180')}
          />
        </span>
      </button>
      {open ? <div className="space-y-4 border-t p-4">{children}</div> : null}
    </section>
  );
}

function Preview({ c }: { c: SettingsController }) {
  const f = c.form;
  const accent = f.accent ?? '#1d4ed8';
  const publicContacts = f.contacts.filter((x) => x.isPublic && x.value);
  const privateContacts = f.contacts.filter((x) => !x.isPublic && x.value);
  const groups = [{ id: null as string | null, name: '' }, ...f.groups];
  return (
    <div className="space-y-3 lg:sticky lg:top-4">
      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Como sua igreja aparece
      </p>
      <div className="overflow-hidden rounded-xl border bg-background">
        <div
          className="flex items-center gap-3 p-4"
          style={{ background: accent, color: textOn(accent) }}
        >
          <div className="rounded-md bg-background/90 p-1">
            <LogoMark c={c} size="sm" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{f.name || 'Sem nome'}</p>
            {f.website ? (
              <p className="truncate text-xs opacity-80">
                {f.website.replace(/^https?:\/\//, '')}
              </p>
            ) : null}
          </div>
        </div>
        <div className="space-y-4 p-4 text-sm">
          {publicContacts.length ? (
            <ul className="space-y-1">
              {publicContacts.map((x) => (
                <li key={x.id} className="flex items-center gap-2">
                  {x.kind === 'phone' ? (
                    <Phone className="size-3.5" />
                  ) : (
                    <Mail className="size-3.5" />
                  )}
                  {x.value}
                  {x.isWhatsApp ? (
                    <MessageCircle className="size-3.5 text-green-600" />
                  ) : null}
                  {x.label ? (
                    <span className="text-muted-foreground">· {x.label}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {groups.map((g) => {
            const ls = f.links.filter((l) => l.groupId === g.id && l.url);
            if (!ls.length) return null;
            return (
              <div key={g.id ?? 'none'} className="space-y-1">
                {g.name ? (
                  <p className="font-medium text-muted-foreground text-xs">
                    {g.name}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  {ls.map((l) => {
                    const d = detectNetwork(l.url);
                    return (
                      <span
                        key={l.id}
                        className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                      >
                        <Globe className="size-3" />
                        {d && 'network' in d ? d.network : '?'}
                        {l.label ? ` · ${l.label}` : ''}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {f.legal.isPublic && f.legal.cnpj ? (
            <p className="text-muted-foreground text-xs">
              {f.legal.legalName} · CNPJ {f.legal.cnpj}
            </p>
          ) : null}
        </div>
      </div>
      {privateContacts.length || (!f.legal.isPublic && f.legal.cnpj) ? (
        <div className="space-y-1 rounded-xl border border-dashed p-3 text-muted-foreground text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <Lock className="size-3.5" /> Só admins veem
          </p>
          {privateContacts.map((x) => (
            <p key={x.id}>
              {x.value}
              {x.label ? ` · ${x.label}` : ''}
            </p>
          ))}
          {!f.legal.isPublic && f.legal.cnpj ? (
            <p>CNPJ {f.legal.cnpj}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function VariantC({ c }: { c: SettingsController }) {
  const f = c.form;
  return (
    <WorkspacePage>
      <WorkspaceIntroPanel
        title="Configurações da igreja"
        description={INTRO}
        aside={<SaveButtons c={c} />}
      />
      <ErrorBanner c={c} />
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-3">
          <Collapsible
            title="Identidade"
            summary={`${f.name} · ${f.slug}`}
            errors={errorsIn(c, 'name') + errorsIn(c, 'slug')}
            defaultOpen
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <NameField c={c} />
              <SlugField c={c} />
              <WebsiteField c={c} />
            </div>
            <AccentPicker c={c} />
            <div className="border-t pt-4">
              <LogoControl c={c} compact />
            </div>
          </Collapsible>
          <Collapsible
            title="Contatos"
            summary={
              f.contacts.length
                ? `${f.contacts.length} contatos · ${f.contacts.filter((x) => x.isPublic).length} públicos`
                : 'Nenhum contato'
            }
            errors={errorsIn(c, 'contacts.')}
          >
            <ContactsEditor c={c} />
          </Collapsible>
          <Collapsible
            title="Redes sociais"
            summary={
              f.links.length
                ? `${f.links.length} links em ${f.groups.length + 1} grupos`
                : 'Nenhuma rede social'
            }
            errors={errorsIn(c, 'links.')}
          >
            <SocialLinksEditor c={c} />
          </Collapsible>
          <Collapsible
            title="Dados jurídicos"
            summary={
              f.legal.cnpj
                ? `CNPJ ${f.legal.cnpj} · ${f.legal.isPublic ? 'público' : 'privado'}`
                : 'Não informados'
            }
            errors={errorsIn(c, 'legal.')}
          >
            <LegalEditor c={c} />
          </Collapsible>
          <Collapsible title="Endereço" summary="Em breve" errors={0}>
            <AddressSlot />
          </Collapsible>
          <ProgrammeHint />
        </div>
        <Preview c={c} />
      </div>
      <SlugConfirm c={c} />
    </WorkspacePage>
  );
}

export const VARIANTS = {
  A: { name: 'Página única', Component: VariantA },
  B: { name: 'Seções laterais', Component: VariantB },
  C: { name: 'Prévia ao vivo', Component: VariantC },
} as const;

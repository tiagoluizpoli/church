// PROTOTYPE, throwaway (wayfinder #980, round 2): variant C, the chosen base, with the user's first-pass feedback:
// A's save bar, informational header, logo card on the left inside Informações, groups explained above the lists, all sections open + expand/collapse all,
// groups shared by contacts and links (and grouped together in the preview), preview in a drawer on small screens.
import {
  AlertCircle,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
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
  LegalEditor,
  LogoControl,
  LogoMark,
  NameField,
  ProgrammeHint,
  SaveButtons,
  SlugConfirm,
  SlugField,
  WebsiteField,
} from './prototype-editors';
import {
  GroupedContactsEditor,
  GroupedLinksEditor,
  GroupsEditor,
} from './prototype-grouped';
import {
  type Contact,
  detectNetwork,
  type SettingsController,
  type SocialLink,
  textOn,
} from './prototype-state';
import { HeaderStatChip } from '@/components/header-stat-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { cn } from '@/lib/utils';

const SECTIONS = [
  'info',
  'contacts',
  'links',
  'groups',
  'legal',
  'address',
] as const;
type SectionKey = (typeof SECTIONS)[number];

const errorsIn = (c: SettingsController, ...prefixes: string[]) =>
  Object.keys(c.errors).filter((k) => prefixes.some((p) => k.startsWith(p)))
    .length;

function SectionCard({
  title,
  summary,
  errors,
  open,
  onToggle,
  className,
  children,
}: {
  title: string;
  summary: string;
  errors: number;
  open: boolean;
  onToggle: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('surface-panel', className)}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
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

function ContactLine({ x }: { x: Contact }) {
  return (
    <li className="flex items-center gap-2">
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
  );
}

function LinkChips({ links }: { links: SocialLink[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {links.map((l) => {
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
  );
}

function Preview({ c }: { c: SettingsController }) {
  const f = c.form;
  const accent = f.accent ?? '#1d4ed8';
  const blocks = [{ id: null as string | null, name: '' }, ...f.groups]
    .map((g) => ({
      ...g,
      contacts: f.contacts.filter(
        (x) => x.groupId === g.id && x.isPublic && x.value,
      ),
      links: f.links.filter((l) => l.groupId === g.id && l.url),
    }))
    .filter((b) => b.contacts.length || b.links.length);
  const privateContacts = f.contacts.filter((x) => !x.isPublic && x.value);
  const groupName = (id: string | null) =>
    f.groups.find((g) => g.id === id)?.name;
  return (
    <div className="space-y-3">
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
        <div className="divide-y text-sm">
          {blocks.map((b) => (
            <div key={b.id ?? 'church'} className="space-y-2 p-4">
              {b.name ? <p className="font-medium">{b.name}</p> : null}
              {b.contacts.length ? (
                <ul className="space-y-1">
                  {b.contacts.map((x) => (
                    <ContactLine key={x.id} x={x} />
                  ))}
                </ul>
              ) : null}
              {b.links.length ? <LinkChips links={b.links} /> : null}
            </div>
          ))}
          {f.legal.isPublic && f.legal.cnpj ? (
            <p className="p-4 text-muted-foreground text-xs">
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
              {groupName(x.groupId) ? ` · ${groupName(x.groupId)}` : ''}
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

function SaveBar({ c }: { c: SettingsController }) {
  return (
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
  );
}

export function VariantC({ c }: { c: SettingsController }) {
  const f = c.form;
  const [open, setOpen] = React.useState<Record<SectionKey, boolean>>(
    () =>
      Object.fromEntries(SECTIONS.map((k) => [k, true])) as Record<
        SectionKey,
        boolean
      >,
  );
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const allOpen = SECTIONS.every((k) => open[k]);
  const setAll = (value: boolean) =>
    setOpen(
      Object.fromEntries(SECTIONS.map((k) => [k, value])) as Record<
        SectionKey,
        boolean
      >,
    );
  const toggle = (k: SectionKey) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const count = {
    info: errorsIn(c, 'name', 'slug', 'website'),
    contacts: errorsIn(c, 'contacts.'),
    links: errorsIn(c, 'links.'),
    legal: errorsIn(c, 'legal.'),
  };
  React.useEffect(() => {
    // A failing save opens every section that holds an error.
    if (c.errorCount)
      setOpen((o) => ({
        ...o,
        info: o.info || errorsIn(c, 'name', 'slug', 'website') > 0,
        contacts: o.contacts || errorsIn(c, 'contacts.') > 0,
        links: o.links || errorsIn(c, 'links.') > 0,
        legal: o.legal || errorsIn(c, 'legal.') > 0,
      }));
  }, [c.errorCount]);

  const publicCount =
    f.contacts.filter((x) => x.isPublic).length +
    f.links.length +
    (f.legal.isPublic && f.legal.cnpj ? 1 : 0);
  const privateCount =
    f.contacts.filter((x) => !x.isPublic).length +
    (!f.legal.isPublic && f.legal.cnpj ? 1 : 0);
  const filled = [
    f.name,
    c.logo,
    f.contacts.length,
    f.links.length,
    f.legal.cnpj,
  ].filter(Boolean).length;

  return (
    <WorkspacePage className="pb-24">
      <WorkspaceIntroPanel
        title="Configurações da igreja"
        description="Como a sua igreja se apresenta no app, nos e-mails e na página pública."
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <HeaderStatChip
              testId="proto-public"
              label="Públicos"
              value={publicCount}
            />
            <HeaderStatChip
              testId="proto-private"
              label="Privados"
              value={privateCount}
            />
            <HeaderStatChip
              testId="proto-filled"
              label="Preenchido"
              value={`${filled} de 5`}
            />
            <Button
              variant="outline"
              size="sm"
              className="lg:hidden"
              onClick={() => setPreviewOpen(true)}
            >
              <Eye /> Ver prévia
            </Button>
          </div>
        }
      />
      {c.errorCount ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm">
          <AlertCircle className="size-4" />
          Nada foi salvo. Corrija {c.errorCount}{' '}
          {c.errorCount === 1 ? 'campo' : 'campos'} marcados abaixo.
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setAll(!allOpen)}>
              {allOpen ? <ChevronsDownUp /> : <ChevronsUpDown />}
              {allOpen ? 'Recolher tudo' : 'Expandir tudo'}
            </Button>
          </div>
          <SectionCard
            title="Informações"
            summary={`${f.name} · ${f.slug}`}
            errors={count.info}
            open={open.info}
            onToggle={() => toggle('info')}
          >
            <div className="grid gap-5 md:grid-cols-[13rem_1fr]">
              <LogoControl c={c} stacked />
              <div className="min-w-0 space-y-4">
                <div className="grid gap-4 2xl:grid-cols-2">
                  <NameField c={c} />
                  <SlugField c={c} />
                  <WebsiteField c={c} />
                </div>
                <AccentPicker c={c} />
              </div>
            </div>
          </SectionCard>
          <SectionCard
            title="Grupos de contato"
            summary="Juntam os contatos e as redes de uma pessoa ou ministério. O que não está em um grupo é da igreja e aparece primeiro."
            errors={0}
            open={open.groups}
            onToggle={() => toggle('groups')}
          >
            <GroupsEditor c={c} />
          </SectionCard>
          <SectionCard
            title="Contatos"
            summary={
              f.contacts.length
                ? `${f.contacts.length} contatos · ${f.contacts.filter((x) => x.isPublic).length} públicos`
                : 'Nenhum contato'
            }
            errors={count.contacts}
            open={open.contacts}
            onToggle={() => toggle('contacts')}
          >
            <GroupedContactsEditor c={c} />
          </SectionCard>
          <SectionCard
            title="Redes sociais"
            summary={
              f.links.length
                ? `${f.links.length} links · sempre públicos`
                : 'Nenhuma rede social'
            }
            errors={count.links}
            open={open.links}
            onToggle={() => toggle('links')}
          >
            <GroupedLinksEditor c={c} />
          </SectionCard>
          <SectionCard
            title="Dados jurídicos"
            summary={
              f.legal.cnpj
                ? `CNPJ ${f.legal.cnpj} · ${f.legal.isPublic ? 'público' : 'privado'}`
                : 'Não informados'
            }
            errors={count.legal}
            open={open.legal}
            onToggle={() => toggle('legal')}
          >
            <LegalEditor c={c} />
          </SectionCard>
          <SectionCard
            title="Endereço"
            summary="Em breve"
            errors={0}
            open={open.address}
            onToggle={() => toggle('address')}
          >
            <AddressSlot />
          </SectionCard>
          <ProgrammeHint />
        </div>
        <aside className="hidden space-y-3 lg:sticky lg:top-4 lg:block lg:self-start">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Como sua igreja aparece
          </p>
          <Preview c={c} />
        </aside>
      </div>
      <Drawer open={previewOpen} onOpenChange={setPreviewOpen} showSwipeHandle>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Como sua igreja aparece</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto p-4 pt-0">
            <Preview c={c} />
          </div>
        </DrawerContent>
      </Drawer>
      <SaveBar c={c} />
      <SlugConfirm c={c} />
    </WorkspacePage>
  );
}

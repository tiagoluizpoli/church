// PROTOTYPE, throwaway (wayfinder #980, round 3): variant C, the chosen base, after the first critique.
// Fixes: no sideways overflow (side preview only at xl, drawer below), two-line rows, Contact Groups as a
// per-row field (rename/reorder in the preview), logo removal with undo, focus rings + touch sizing, a11y names,
// error banner announced, save bar repeats the error count, success toast, Ctrl+S.
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  AtSign,
  Check,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Church as ChurchIcon,
  Eye,
  Globe,
  Hash,
  ImageUp,
  Lock,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Smartphone,
  Trash2,
  Zap,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import {
  AddressSlot,
  FieldError,
  IconInput,
  LegalEditor,
  LogoMark,
  ProgrammeHint,
  SaveButtons,
  SlugConfirm,
  WebsiteField,
} from './prototype-editors';
import {
  GroupedContactsEditor,
  GroupedLinksEditor,
  useIconSize,
} from './prototype-grouped';
import {
  type Contact,
  detectNetwork,
  move,
  type SettingsController,
  type SocialLink,
  slugify,
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
import { FormControlSizeProvider } from '@/components/ui/form-control-size';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

const SECTIONS = ['info', 'contacts', 'links', 'legal', 'address'] as const;
type SectionKey = (typeof SECTIONS)[number];

const PRESETS = [
  { hex: '#1d4ed8', name: 'Azul' },
  { hex: '#0f766e', name: 'Verde-azulado' },
  { hex: '#15803d', name: 'Verde' },
  { hex: '#a16207', name: 'Mostarda' },
  { hex: '#c2410c', name: 'Laranja' },
  { hex: '#b91c1c', name: 'Vermelho' },
  { hex: '#be185d', name: 'Rosa' },
  { hex: '#7e22ce', name: 'Roxo' },
  { hex: '#4338ca', name: 'Índigo' },
  { hex: '#334155', name: 'Grafite' },
];

const errorsIn = (c: SettingsController, ...prefixes: string[]) =>
  Object.keys(c.errors).filter((k) => prefixes.some((p) => k.startsWith(p)))
    .length;

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

// ─── fields specific to this round ──────────────────────────────

function NameFieldC({ c }: { c: SettingsController }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="church-name">Nome da igreja</Label>
      <IconInput
        icon={ChurchIcon}
        id="church-name"
        value={c.form.name}
        aria-invalid={!!c.errors.name}
        onChange={(e) => {
          c.patch({ name: e.target.value });
          c.clearError('name');
        }}
      />
      <FieldError message={c.errors.name} />
    </div>
  );
}

// "Link da igreja" instead of "Endereço da igreja", so it no longer collides with the street address.
function SlugFieldC({ c }: { c: SettingsController }) {
  const changed = c.form.slug !== c.saved.slug;
  return (
    <div className="space-y-1.5">
      <Label htmlFor="church-slug">Link da igreja</Label>
      <div className="flex gap-2">
        <IconInput
          icon={AtSign}
          wrapperClassName="flex-1"
          id="church-slug"
          value={c.form.slug}
          aria-invalid={!!c.errors.slug}
          onChange={(e) => c.patch({ slug: e.target.value.toLowerCase() })}
        />
        <Button
          variant="outline"
          type="button"
          onClick={() => c.patch({ slug: slugify(c.form.name) })}
        >
          Gerar do nome
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        igreja.app/
        <span className="font-medium text-foreground">
          {c.form.slug || '…'}
        </span>
        {changed ? ` · antes: ${c.saved.slug}. Você confirma ao salvar.` : ''}
      </p>
      <FieldError message={c.errors.slug} />
    </div>
  );
}

function AccentPickerC({ c }: { c: SettingsController }) {
  const value = c.form.accent;
  const touch = useIconSize() === 'icon-touch';
  const swatch = touch ? 'size-11' : 'size-9';
  return (
    <fieldset className="space-y-2">
      <legend className="font-medium text-sm">Cor de destaque</legend>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          aria-pressed={value === null}
          onClick={() => c.patch({ accent: null })}
          className={cn(
            value === null &&
              'ring-2 ring-ring ring-offset-2 ring-offset-background',
          )}
        >
          Padrão do app
        </Button>
        {PRESETS.map((p) => (
          <button
            key={p.hex}
            type="button"
            aria-label={p.name}
            aria-pressed={value === p.hex}
            title={p.name}
            onClick={() => c.patch({ accent: p.hex })}
            className={cn(
              swatch,
              'flex items-center justify-center rounded-md border border-black/10 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
            style={{ background: p.hex, color: textOn(p.hex) }}
          >
            {value === p.hex ? <Check className="size-4" aria-hidden /> : null}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="Escolher outra cor"
          className={cn(
            swatch,
            'cursor-pointer rounded-md border bg-transparent p-0.5',
          )}
          value={value ?? '#1d4ed8'}
          onChange={(e) => c.patch({ accent: e.target.value })}
        />
        <IconInput
          icon={Hash}
          wrapperClassName="w-36"
          aria-label="Código da cor"
          className="font-mono"
          value={value ?? ''}
          placeholder="#rrggbb"
          onChange={(e) => c.patch({ accent: e.target.value || null })}
        />
      </div>
      <p className="text-pretty text-muted-foreground text-sm">
        Aparece na área do logo e no topo dos e-mails. O resto do app não muda
        de cor.
      </p>
    </fieldset>
  );
}

// One change button; removal is undoable from the toast; "saved instantly" is said at body size.
function LogoCardC({ c }: { c: SettingsController }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string>();
  const onFile = (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
      return setError('Use PNG, JPEG ou WebP.');
    if (file.size > 5 * 1024 * 1024)
      return setError('O arquivo passa de 5 MB.');
    setError(undefined);
    c.setLogo(URL.createObjectURL(file));
    toast.success('Logo atualizado');
  };
  const remove = () => {
    const previous = c.logo;
    c.setLogo(null);
    toast('Logo removido', {
      action: { label: 'Desfazer', onClick: () => c.setLogo(previous) },
    });
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center rounded-lg border bg-muted/40 p-3">
        <LogoMark c={c} size="lg" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          type="button"
          onClick={() => inputRef.current?.click()}
          className={c.logo ? '' : 'col-span-2'}
        >
          <ImageUp /> {c.logo ? 'Trocar' : 'Enviar logo'}
        </Button>
        {c.logo ? (
          <Button variant="ghost" type="button" onClick={remove}>
            <Trash2 /> Remover
          </Button>
        ) : null}
      </div>
      <p className="flex items-start gap-1.5 text-sm">
        <Zap
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <span>
          Salvo na hora.{' '}
          <span className="text-muted-foreground">
            PNG, JPEG ou WebP, até 5 MB.
          </span>
        </span>
      </p>
      <FieldError message={error} />
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </div>
  );
}

// ─── layout pieces ──────────────────────────────────────────────

function SectionCard({
  id,
  title,
  summary,
  errors,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  errors: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-panel" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${id}-body`}
          className="flex w-full items-center justify-between gap-3 rounded-[inherit] p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0">
            <span className="block font-semibold text-base">{title}</span>
            <span className="block truncate font-normal text-muted-foreground text-sm">
              {summary}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {errors ? (
              <Badge variant="destructive">
                {plural(errors, 'erro', 'erros')}
              </Badge>
            ) : null}
            <ChevronDown
              className={cn('size-4 transition', open && 'rotate-180')}
              aria-hidden
            />
          </span>
        </button>
      </h2>
      {open ? (
        <div id={`${id}-body`} className="space-y-4 border-t p-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function ContactLine({ x }: { x: Contact }) {
  return (
    <li className="flex items-center gap-2">
      {x.kind === 'phone' && x.phoneType !== 'landline' ? (
        <Smartphone className="size-3.5" aria-hidden />
      ) : x.kind === 'phone' ? (
        <Phone className="size-3.5" aria-hidden />
      ) : (
        <Mail className="size-3.5" aria-hidden />
      )}
      {x.value}
      {x.isWhatsApp ? (
        <MessageCircle className="size-3.5" aria-label="WhatsApp" />
      ) : null}
      {x.label ? (
        <span className="text-muted-foreground">· {x.label}</span>
      ) : null}
    </li>
  );
}

function LinkChips({ links }: { links: SocialLink[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {links.map((l) => {
        const d = detectNetwork(l.url);
        return (
          <li
            key={l.id}
            className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
          >
            <Globe className="size-3" aria-hidden />
            {d && 'network' in d ? d.network : '?'}
            {l.label ? ` · ${l.label}` : ''}
          </li>
        );
      })}
    </ul>
  );
}

// Group rename and reorder live here, on the blocks they affect.
function GroupHeader({
  c,
  id,
  name,
}: {
  c: SettingsController;
  id: string;
  name: string;
}) {
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(name);
  const size = useIconSize();
  const index = c.form.groups.findIndex((g) => g.id === id);
  const commit = () => {
    const trimmed = text.trim();
    if (trimmed)
      c.patch({
        groups: c.form.groups.map((g) =>
          g.id === id ? { ...g, name: trimmed } : g,
        ),
      });
    setEditing(false);
  };
  if (editing) {
    return (
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <Input
          aria-label="Nome do grupo"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
        />
      </form>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <p className="min-w-0 flex-1 truncate font-medium">{name}</p>
      <Button
        size={size}
        variant="ghost"
        aria-label={`Renomear ${name}`}
        onClick={() => {
          setText(name);
          setEditing(true);
        }}
      >
        <Pencil />
      </Button>
      <Button
        size={size}
        variant="ghost"
        aria-label={`Subir ${name}`}
        disabled={index === 0}
        onClick={() => c.patch({ groups: move(c.form.groups, index, -1) })}
      >
        <ArrowUp />
      </Button>
      <Button
        size={size}
        variant="ghost"
        aria-label={`Descer ${name}`}
        disabled={index === c.form.groups.length - 1}
        onClick={() => c.patch({ groups: move(c.form.groups, index, 1) })}
      >
        <ArrowDown />
      </Button>
    </div>
  );
}

function Preview({ c, titleId }: { c: SettingsController; titleId?: string }) {
  const f = c.form;
  const accent = f.accent ?? '#1d4ed8';
  const blocks = [{ id: null as string | null, name: '' }, ...f.groups].map(
    (g) => ({
      ...g,
      contacts: f.contacts.filter(
        (x) => x.groupId === g.id && x.isPublic && x.value,
      ),
      links: f.links.filter((l) => l.groupId === g.id && l.url),
    }),
  );
  const privateContacts = f.contacts.filter((x) => !x.isPublic && x.value);
  const groupName = (id: string | null) =>
    f.groups.find((g) => g.id === id)?.name;
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border bg-background">
        {titleId ? (
          <h2
            id={titleId}
            className="border-b px-4 py-3 font-semibold text-base"
          >
            Como sua igreja aparece
          </h2>
        ) : null}
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
              <p className="truncate text-sm opacity-90">
                {f.website.replace(/^https?:\/\//, '')}
              </p>
            ) : null}
          </div>
        </div>
        <div className="divide-y text-sm">
          {blocks.map((b) =>
            b.id === null && !b.contacts.length && !b.links.length ? null : (
              <div key={b.id ?? 'church'} className="space-y-2 p-4">
                {b.id ? <GroupHeader c={c} id={b.id} name={b.name} /> : null}
                {b.contacts.length ? (
                  <ul className="space-y-1">
                    {b.contacts.map((x) => (
                      <ContactLine key={x.id} x={x} />
                    ))}
                  </ul>
                ) : null}
                {b.links.length ? <LinkChips links={b.links} /> : null}
                {b.id && !b.contacts.length && !b.links.length ? (
                  <p className="text-muted-foreground">
                    Nada público neste grupo ainda.
                  </p>
                ) : null}
              </div>
            ),
          )}
          {f.legal.isPublic && f.legal.cnpj ? (
            <p className="p-4 text-muted-foreground text-sm">
              {f.legal.legalName} · CNPJ {f.legal.cnpj}
            </p>
          ) : null}
        </div>
      </div>
      {privateContacts.length || (!f.legal.isPublic && f.legal.cnpj) ? (
        <div className="space-y-1 rounded-xl border border-dashed p-3 text-muted-foreground text-sm">
          <p className="flex items-center gap-1.5 font-medium text-foreground">
            <Lock className="size-3.5" aria-hidden /> Só admins veem
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
      role="region"
      aria-label="Alterações não salvas"
      className={cn(
        'fixed inset-x-3 bottom-16 z-40 mx-auto flex max-w-xl flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border bg-background p-2 pl-4 shadow-lg transition sm:inset-x-0 sm:w-fit',
        c.dirty
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-4 opacity-0',
      )}
    >
      <span className="text-sm">
        {c.errorCount ? (
          <span className="font-medium text-destructive">
            {plural(c.errorCount, 'campo com erro', 'campos com erro')}
          </span>
        ) : (
          'Alterações não salvas'
        )}
      </span>
      <SaveButtons c={c} />
    </div>
  );
}

export function VariantC({ c }: { c: SettingsController }) {
  const f = c.form;
  const isMobile = useMediaQuery('(max-width: 767px)');
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
  const { errorCount, dirty, save } = c;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reopen only when a new failed save lands
  React.useEffect(() => {
    if (errorCount)
      setOpen((o) => ({
        ...o,
        info: o.info || count.info > 0,
        contacts: o.contacts || count.contacts > 0,
        links: o.links || count.links > 0,
        legal: o.legal || count.legal > 0,
      }));
  }, [errorCount]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty) save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, save]);

  const publicCount =
    f.contacts.filter((x) => x.isPublic).length +
    f.links.length +
    (f.legal.isPublic && f.legal.cnpj ? 1 : 0);
  const privateCount =
    f.contacts.filter((x) => !x.isPublic).length +
    (!f.legal.isPublic && f.legal.cnpj ? 1 : 0);

  return (
    <FormControlSizeProvider size={isMobile ? 'touch' : 'default'}>
      <WorkspacePage className="pb-28">
        <WorkspaceIntroPanel
          title="Configurações da igreja"
          description="Como a sua igreja se apresenta no app, nos e-mails e na página pública."
          aside={
            <div className="flex flex-wrap items-center gap-2">
              <HeaderStatChip
                testId="proto-public"
                label="Visíveis ao público"
                value={publicCount}
              />
              <HeaderStatChip
                testId="proto-private"
                label="Só admins"
                value={privateCount}
              />
              <Button
                variant="outline"
                className="xl:hidden"
                onClick={() => setPreviewOpen(true)}
              >
                <Eye /> Ver prévia
              </Button>
              <Button variant="ghost" onClick={() => setAll(!allOpen)}>
                {allOpen ? <ChevronsDownUp /> : <ChevronsUpDown />}
                {allOpen ? 'Recolher tudo' : 'Expandir tudo'}
              </Button>
            </div>
          }
        />
        {errorCount ? (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm"
          >
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            Nada foi salvo. Corrija{' '}
            {plural(errorCount, 'campo marcado', 'campos marcados')} abaixo e
            salve de novo.
          </div>
        ) : null}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-3">
            <SectionCard
              id="info"
              title="Informações"
              summary={`${f.name} · igreja.app/${f.slug}`}
              errors={count.info}
              open={open.info}
              onToggle={() => toggle('info')}
            >
              <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
                <LogoCardC c={c} />
                <div className="min-w-0 space-y-4">
                  <div className="grid gap-4 2xl:grid-cols-2">
                    <NameFieldC c={c} />
                    <SlugFieldC c={c} />
                    <WebsiteField c={c} />
                  </div>
                  <AccentPickerC c={c} />
                </div>
              </div>
            </SectionCard>
            <SectionCard
              id="contacts"
              title="Contatos"
              summary={
                f.contacts.length
                  ? `${plural(f.contacts.length, 'contato', 'contatos')} · ${plural(f.contacts.filter((x) => x.isPublic).length, 'público', 'públicos')}`
                  : 'Nenhum contato'
              }
              errors={count.contacts}
              open={open.contacts}
              onToggle={() => toggle('contacts')}
            >
              <GroupedContactsEditor c={c} />
            </SectionCard>
            <SectionCard
              id="links"
              title="Redes sociais"
              summary={
                f.links.length
                  ? `${plural(f.links.length, 'rede', 'redes')} · sempre públicas`
                  : 'Nenhuma rede social'
              }
              errors={count.links}
              open={open.links}
              onToggle={() => toggle('links')}
            >
              <GroupedLinksEditor c={c} />
            </SectionCard>
            <SectionCard
              id="legal"
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
              id="address"
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
          <aside
            className="hidden min-w-0 space-y-3 xl:sticky xl:top-4 xl:block xl:self-start"
            aria-labelledby="preview-title"
          >
            <Preview c={c} titleId="preview-title" />
          </aside>
        </div>
        <Drawer
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          showSwipeHandle
        >
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
    </FormControlSizeProvider>
  );
}

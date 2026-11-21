// PROTOTYPE, throwaway: field editors shared by the Church Settings variants (wayfinder #980).
import {
  ArrowDown,
  ArrowUp,
  Church,
  Globe,
  ImageUp,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Trash2,
  Wand2,
} from 'lucide-react';
import * as React from 'react';
import {
  ACCENT_PRESETS,
  type Contact,
  detectNetwork,
  move,
  newId,
  type SettingsController,
  slugify,
  textOn,
} from './prototype-state';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-destructive text-sm">{message}</p> : null;
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && !error ? (
        <p className="text-muted-foreground text-sm">{hint}</p>
      ) : null}
      <FieldError message={error} />
    </div>
  );
}

export function Confirm({
  open,
  title,
  description,
  confirmLabel,
  onResult,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onResult: (ok: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onResult(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onResult(false)}>
            Cancelar
          </Button>
          <Button onClick={() => onResult(true)}>{confirmLabel}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function SlugConfirm({ c }: { c: SettingsController }) {
  return (
    <Confirm
      open={c.pendingSlugConfirm}
      title="Mudar o endereço da igreja?"
      description={`Links já compartilhados e materiais impressos com "${c.saved.slug}" precisam ser atualizados. O endereço antigo continua reservado para a sua igreja.`}
      confirmLabel="Mudar e salvar"
      onResult={c.confirmSlug}
    />
  );
}

export function NameField({ c }: { c: SettingsController }) {
  return (
    <Field label="Nome da igreja" error={c.errors.name}>
      <Input
        value={c.form.name}
        aria-invalid={!!c.errors.name}
        onChange={(e) => c.patch({ name: e.target.value })}
      />
    </Field>
  );
}

export function SlugField({ c }: { c: SettingsController }) {
  const changed = c.form.slug !== c.saved.slug;
  return (
    <Field
      label="Endereço da igreja"
      hint={
        changed
          ? `Antes: ${c.saved.slug}. Você vai confirmar ao salvar.`
          : 'Usado só nos endereços web da igreja.'
      }
      error={c.errors.slug}
    >
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-md border border-input pl-3 text-muted-foreground text-sm">
          <span className="shrink-0">igreja.app/</span>
          <input
            className="h-9 min-w-0 flex-1 bg-transparent pr-3 text-foreground outline-none"
            value={c.form.slug}
            onChange={(e) => c.patch({ slug: e.target.value.toLowerCase() })}
          />
        </div>
        <Button
          variant="outline"
          type="button"
          onClick={() => c.patch({ slug: slugify(c.form.name) })}
        >
          <Wand2 /> Gerar do nome
        </Button>
      </div>
    </Field>
  );
}

export function WebsiteField({ c }: { c: SettingsController }) {
  return (
    <Field
      label="Site"
      hint="Opcional. https:// é adicionado se faltar."
      error={c.errors.website}
    >
      <Input
        placeholder="https://"
        value={c.form.website}
        onChange={(e) => c.patch({ website: e.target.value })}
      />
    </Field>
  );
}

export function AccentPicker({ c }: { c: SettingsController }) {
  const value = c.form.accent;
  return (
    <Field
      label="Cor de destaque"
      hint="Marca a identidade da igreja (área do logo, cabeçalho de e-mails). Não muda o tema do app."
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => c.patch({ accent: null })}
          className={cn(
            'h-8 rounded-full border px-3 text-sm',
            value === null && 'ring-2 ring-ring ring-offset-2',
          )}
        >
          Padrão
        </button>
        {ACCENT_PRESETS.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={hex}
            onClick={() => c.patch({ accent: hex })}
            className={cn(
              'size-8 rounded-full border',
              value === hex && 'ring-2 ring-ring ring-offset-2',
            )}
            style={{ background: hex }}
          />
        ))}
        <label className="flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm">
          <input
            type="color"
            className="size-6 cursor-pointer rounded-full border-0 bg-transparent"
            value={value ?? '#1d4ed8'}
            onChange={(e) => c.patch({ accent: e.target.value })}
          />
          <input
            className="w-20 bg-transparent font-mono outline-none"
            value={value ?? ''}
            placeholder="#rrggbb"
            onChange={(e) => c.patch({ accent: e.target.value || null })}
          />
        </label>
      </div>
    </Field>
  );
}

export function LogoMark({
  c,
  size = 'md',
}: {
  c: SettingsController;
  size?: 'sm' | 'md';
}) {
  const accent = c.form.accent ?? '#1d4ed8';
  const box = size === 'sm' ? 'h-10 w-24' : 'h-20 w-40';
  if (c.logo && c.logo !== 'demo') {
    return <img src={c.logo} alt="" className={cn(box, 'object-contain')} />;
  }
  if (c.logo === 'demo') {
    return (
      <div
        className={cn(
          box,
          'flex items-center justify-center gap-2 rounded-md font-semibold',
        )}
        style={{ background: accent, color: textOn(accent) }}
      >
        <Church className="size-6" /> IBE
      </div>
    );
  }
  return (
    <div
      className={cn(
        box,
        'flex items-center justify-center rounded-md border border-dashed text-muted-foreground text-xs',
      )}
    >
      Sem logo
    </div>
  );
}

export function LogoControl({
  c,
  compact = false,
}: {
  c: SettingsController;
  compact?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string>();
  const onFile = (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Use PNG, JPEG ou WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('O arquivo passa de 5 MB.');
      return;
    }
    setError(undefined);
    c.setLogo(URL.createObjectURL(file));
  };
  return (
    <div
      className={cn(
        'flex gap-4',
        compact ? 'items-center' : 'flex-col sm:flex-row sm:items-center',
      )}
    >
      <LogoMark c={c} />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            type="button"
            onClick={() => inputRef.current?.click()}
          >
            <ImageUp /> {c.logo ? 'Trocar logo' : 'Enviar logo'}
          </Button>
          {c.logo ? (
            <Button
              variant="ghost"
              type="button"
              onClick={() => c.setLogo(null)}
            >
              <Trash2 /> Remover
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">
          PNG, JPEG ou WebP, até 5 MB. Aplicado na hora, sem precisar salvar.
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
    </div>
  );
}

function RowMoves({
  onUp,
  onDown,
  first,
  last,
}: {
  onUp: () => void;
  onDown: () => void;
  first: boolean;
  last: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-col">
      <Button
        size="icon-xs"
        variant="ghost"
        disabled={first}
        onClick={onUp}
        aria-label="Subir"
      >
        <ArrowUp />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        disabled={last}
        onClick={onDown}
        aria-label="Descer"
      >
        <ArrowDown />
      </Button>
    </div>
  );
}

export function EmptyList({
  icon,
  text,
  action,
}: {
  icon: React.ReactNode;
  text: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4 text-muted-foreground text-sm sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-center gap-2">
        {icon}
        {text}
      </span>
      {action}
    </div>
  );
}

export function ContactsEditor({ c }: { c: SettingsController }) {
  const [confirming, setConfirming] = React.useState<Contact | null>(null);
  const contacts = c.form.contacts;
  const update = (id: string, p: Partial<Contact>) =>
    c.patch({
      contacts: contacts.map((x) => (x.id === id ? { ...x, ...p } : x)),
    });
  const add = (kind: Contact['kind']) =>
    c.patch({
      contacts: [
        ...contacts,
        {
          id: newId(),
          kind,
          value: '',
          label: '',
          isWhatsApp: false,
          isPublic: false,
        },
      ],
    });
  const addButtons = (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => add('phone')}>
        <Phone /> Telefone
      </Button>
      <Button variant="outline" size="sm" onClick={() => add('email')}>
        <Mail /> E-mail
      </Button>
    </div>
  );
  return (
    <div className="space-y-3">
      {contacts.length === 0 ? (
        <EmptyList
          icon={<Phone className="size-4" />}
          text="Nenhum contato. Telefones e e-mails ficam privados até você torná-los públicos."
          action={addButtons}
        />
      ) : (
        <>
          <ul className="divide-y rounded-lg border">
            {contacts.map((ct, i) => {
              const err = c.errors[`contacts.${ct.id}.value`];
              return (
                <li
                  key={ct.id}
                  className={cn(
                    'flex items-start gap-2 p-2',
                    err && 'bg-destructive/5',
                  )}
                >
                  <RowMoves
                    first={i === 0}
                    last={i === contacts.length - 1}
                    onUp={() => c.patch({ contacts: move(contacts, i, -1) })}
                    onDown={() => c.patch({ contacts: move(contacts, i, 1) })}
                  />
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_12rem]">
                    <div className="space-y-1">
                      <div className="relative">
                        {ct.kind === 'phone' ? (
                          <Phone className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                        ) : (
                          <Mail className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                        )}
                        <Input
                          className="pl-8"
                          aria-invalid={!!err}
                          placeholder={
                            ct.kind === 'phone'
                              ? '(11) 98765-4321'
                              : 'nome@igreja.org.br'
                          }
                          value={ct.value}
                          onChange={(e) =>
                            update(ct.id, { value: e.target.value })
                          }
                        />
                      </div>
                      <FieldError message={err} />
                    </div>
                    <Input
                      placeholder="Rótulo (ex.: Secretaria)"
                      value={ct.label}
                      onChange={(e) => update(ct.id, { label: e.target.value })}
                    />
                  </div>
                  <div className="flex shrink-0 items-center gap-3 pt-1.5">
                    {ct.kind === 'phone' ? (
                      <label className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={ct.isWhatsApp}
                          onChange={(e) =>
                            update(ct.id, { isWhatsApp: e.target.checked })
                          }
                        />
                        <MessageCircle className="size-4" /> WhatsApp
                      </label>
                    ) : null}
                    <label className="flex items-center gap-1.5 text-sm">
                      <Switch
                        checked={ct.isPublic}
                        onCheckedChange={(on) =>
                          on
                            ? setConfirming(ct)
                            : update(ct.id, { isPublic: false })
                        }
                      />
                      {ct.isPublic ? (
                        'Público'
                      ) : (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Lock className="size-3.5" />
                          Privado
                        </span>
                      )}
                    </label>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Remover contato"
                      onClick={() =>
                        c.patch({
                          contacts: contacts.filter((x) => x.id !== ct.id),
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {addButtons}
        </>
      )}
      <Confirm
        open={!!confirming}
        title="Tornar este contato público?"
        description={`"${confirming?.value || 'Este contato'}" vai aparecer na página pública da igreja. Se for o número ou e-mail pessoal de alguém, confirme que a pessoa concorda.`}
        confirmLabel="Tornar público"
        onResult={(ok) => {
          if (ok && confirming) update(confirming.id, { isPublic: true });
          setConfirming(null);
        }}
      />
    </div>
  );
}

export function NetworkBadge({ url }: { url: string }) {
  const d = detectNetwork(url);
  if (!d) return <Badge variant="outline">—</Badge>;
  if ('error' in d) return <Badge variant="destructive">?</Badge>;
  return <Badge variant="secondary">{d.network}</Badge>;
}

export function SocialLinksEditor({ c }: { c: SettingsController }) {
  const { links, groups } = c.form;
  const update = (id: string, p: Partial<(typeof links)[number]>) =>
    c.patch({ links: links.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const addLink = (groupId: string | null) =>
    c.patch({
      links: [...links, { id: newId(), url: '', label: '', groupId }],
    });
  const sections: { id: string | null; name: string }[] = [
    { id: null, name: 'Igreja' },
    ...groups,
  ];

  if (links.length === 0 && groups.length === 0) {
    return (
      <EmptyList
        icon={<Globe className="size-4" />}
        text="Nenhuma rede social. Cole o endereço e a rede é reconhecida sozinha."
        action={
          <Button variant="outline" size="sm" onClick={() => addLink(null)}>
            <Plus /> Adicionar link
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((g, gi) => {
        const inGroup = links.filter((l) => l.groupId === g.id);
        return (
          <div key={g.id ?? 'none'} className="space-y-2">
            <div className="flex items-center gap-2">
              {g.id === null ? (
                <h3 className="font-medium text-sm">
                  Sem grupo{' '}
                  <span className="font-normal text-muted-foreground">
                    (aparecem primeiro)
                  </span>
                </h3>
              ) : (
                <>
                  <Input
                    className="h-8 max-w-64 font-medium"
                    value={g.name}
                    onChange={(e) =>
                      c.patch({
                        groups: groups.map((x) =>
                          x.id === g.id ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <RowMoves
                    first={gi === 1}
                    last={gi === sections.length - 1}
                    onUp={() => c.patch({ groups: move(groups, gi - 1, -1) })}
                    onDown={() => c.patch({ groups: move(groups, gi - 1, 1) })}
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remover grupo"
                    onClick={() =>
                      c.patch({
                        groups: groups.filter((x) => x.id !== g.id),
                        links: links.map((l) =>
                          l.groupId === g.id ? { ...l, groupId: null } : l,
                        ),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </div>
            <ul className="divide-y rounded-lg border">
              {inGroup.map((l, i) => {
                const detection = detectNetwork(l.url);
                const err =
                  c.errors[`links.${l.id}.url`] ??
                  (detection && 'error' in detection
                    ? detection.error
                    : undefined);
                const idx = links.indexOf(l);
                return (
                  <li
                    key={l.id}
                    className={cn(
                      'flex items-start gap-2 p-2',
                      err && 'bg-destructive/5',
                    )}
                  >
                    <RowMoves
                      first={i === 0}
                      last={i === inGroup.length - 1}
                      onUp={() =>
                        c.patch({
                          links: move(
                            links,
                            idx,
                            links.indexOf(inGroup[i - 1] ?? l) - idx,
                          ),
                        })
                      }
                      onDown={() =>
                        c.patch({
                          links: move(
                            links,
                            idx,
                            links.indexOf(inGroup[i + 1] ?? l) - idx,
                          ),
                        })
                      }
                    />
                    <div className="w-28 shrink-0 pt-1.5">
                      <NetworkBadge url={l.url} />
                    </div>
                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_12rem]">
                      <div className="space-y-1">
                        <Input
                          aria-invalid={!!err}
                          placeholder="https://instagram.com/suaigreja"
                          value={l.url}
                          onChange={(e) =>
                            update(l.id, { url: e.target.value })
                          }
                        />
                        <FieldError message={err} />
                      </div>
                      <Input
                        placeholder="Descrição (opcional)"
                        value={l.label}
                        onChange={(e) =>
                          update(l.id, { label: e.target.value })
                        }
                      />
                    </div>
                    <select
                      className="h-9 shrink-0 rounded-md border bg-transparent px-2 text-sm"
                      value={l.groupId ?? ''}
                      onChange={(e) =>
                        update(l.id, { groupId: e.target.value || null })
                      }
                      aria-label="Grupo"
                    >
                      <option value="">Sem grupo</option>
                      {groups.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Remover link"
                      onClick={() =>
                        c.patch({ links: links.filter((x) => x.id !== l.id) })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </li>
                );
              })}
              <li className="p-2">
                <Button variant="ghost" size="sm" onClick={() => addLink(g.id)}>
                  <Plus /> Adicionar link{g.id ? ` em ${g.name}` : ''}
                </Button>
              </li>
            </ul>
          </div>
        );
      })}
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          c.patch({ groups: [...groups, { id: newId(), name: 'Novo grupo' }] })
        }
      >
        <Plus /> Novo grupo de links
      </Button>
    </div>
  );
}

export function LegalEditor({ c }: { c: SettingsController }) {
  const legal = c.form.legal;
  const set = (p: Partial<typeof legal>) =>
    c.patch({ legal: { ...legal, ...p } });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Razão social" error={c.errors['legal.legalName']}>
          <Input
            value={legal.legalName}
            onChange={(e) => set({ legalName: e.target.value })}
          />
        </Field>
        <Field label="CNPJ" error={c.errors['legal.cnpj']}>
          <Input
            placeholder="00.000.000/0000-00"
            aria-invalid={!!c.errors['legal.cnpj']}
            value={legal.cnpj}
            onChange={(e) => set({ cnpj: e.target.value })}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={legal.isPublic}
          onCheckedChange={(on) => set({ isPublic: on })}
        />
        Mostrar razão social e CNPJ na página pública
      </label>
    </div>
  );
}

export function AddressSlot() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
      <MapPin className="size-4" />
      Endereço e localização: vem na spec própria (busca de CEP, mapa).
    </div>
  );
}

export function ProgrammeHint() {
  return (
    <p className="text-muted-foreground text-sm">
      A programação pública e os eventos públicos são marcados nos{' '}
      <a className="underline" href="/event-templates">
        Modelos de evento
      </a>{' '}
      e nos eventos de cada ciclo.
    </p>
  );
}

export function SaveButtons({ c }: { c: SettingsController }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" disabled={!c.dirty} onClick={c.discard}>
        Descartar
      </Button>
      <Button disabled={!c.dirty} onClick={c.save}>
        Salvar alterações
      </Button>
    </div>
  );
}

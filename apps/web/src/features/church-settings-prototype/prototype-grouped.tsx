// PROTOTYPE, throwaway (wayfinder #980, round 3): Contact Groups as a field on each row.
// Typing a new "Pessoa ou ministério" creates the group; a group nobody uses disappears.
// Ungrouped items belong to the church and come first. Two-line rows, design-system controls, touch sizing.
import {
  ArrowDown,
  ArrowUp,
  Lock,
  Mail,
  Phone,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import * as React from 'react';
import { Confirm, EmptyList, FieldError } from './prototype-editors';
import {
  type Contact,
  detectNetwork,
  type LinkGroup,
  move,
  newId,
  type SettingsController,
  type SettingsForm,
  type SocialLink,
} from './prototype-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useFormControlSize } from '@/components/ui/form-control-size';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export const CHURCH = 'Da igreja';

export function useIconSize() {
  return useFormControlSize() === 'touch' ? 'icon-touch' : 'icon';
}

// Assigns an item to the group named `name` (creating it), then drops groups nothing uses any more.
function assignGroup(
  f: SettingsForm,
  kind: 'contacts' | 'links',
  itemId: string,
  name: string,
): SettingsForm {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  let groups: LinkGroup[] = f.groups;
  let groupId: string | null = null;
  if (trimmed) {
    const found = groups.find(
      (g) =>
        g.name.toLocaleLowerCase('pt-BR') ===
        trimmed.toLocaleLowerCase('pt-BR'),
    );
    const group = found ?? { id: newId(), name: trimmed };
    if (!found) groups = [...groups, group];
    groupId = group.id;
  }
  const next: SettingsForm =
    kind === 'contacts'
      ? {
          ...f,
          contacts: f.contacts.map((x) =>
            x.id === itemId ? { ...x, groupId } : x,
          ),
        }
      : {
          ...f,
          links: f.links.map((x) => (x.id === itemId ? { ...x, groupId } : x)),
        };
  return pruneGroups({ ...next, groups });
}

const pruneGroups = (f: SettingsForm): SettingsForm => {
  const used = new Set([...f.contacts, ...f.links].map((x) => x.groupId));
  return { ...f, groups: f.groups.filter((g) => used.has(g.id)) };
};

function PersonField({
  c,
  kind,
  item,
}: {
  c: SettingsController;
  kind: 'contacts' | 'links';
  item: { id: string; groupId: string | null };
}) {
  const listId = React.useId();
  const current = c.form.groups.find((g) => g.id === item.groupId)?.name ?? '';
  const [text, setText] = React.useState(current);
  React.useEffect(() => setText(current), [current]);
  const commit = () => {
    if (text.trim() !== current)
      c.setForm((f) => assignGroup(f, kind, item.id, text));
  };
  return (
    <label className="flex min-w-0 flex-1 basis-56 items-center gap-2 sm:max-w-72">
      <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">Pessoa ou ministério</span>
      <Input
        list={listId}
        placeholder="Pessoa ou ministério"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
      <datalist id={listId}>
        {c.form.groups.map((g) => (
          <option key={g.id} value={g.name} />
        ))}
      </datalist>
    </label>
  );
}

function RowActions({
  first,
  last,
  onUp,
  onDown,
  onRemove,
  removeLabel,
}: {
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  removeLabel: string;
}) {
  const size = useIconSize();
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      <Button
        size={size}
        variant="ghost"
        disabled={first}
        onClick={onUp}
        aria-label="Mover para cima"
      >
        <ArrowUp />
      </Button>
      <Button
        size={size}
        variant="ghost"
        disabled={last}
        onClick={onDown}
        aria-label="Mover para baixo"
      >
        <ArrowDown />
      </Button>
      <Button
        size={size}
        variant="ghost"
        onClick={onRemove}
        aria-label={removeLabel}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

interface RowMoves {
  first: boolean;
  last: boolean;
  up: () => void;
  down: () => void;
}

// Renders items section by section (church first, then groups in their order); moves stay within a section.
function GroupedRows<T extends { id: string; groupId: string | null }>({
  c,
  items,
  setItems,
  renderRow,
}: {
  c: SettingsController;
  items: T[];
  setItems: (next: T[]) => void;
  renderRow: (item: T, moves: RowMoves) => React.ReactNode;
}) {
  const sections = [
    { id: null as string | null, name: CHURCH },
    ...c.form.groups,
  ];
  return (
    <div className="space-y-4">
      {sections.map((s) => {
        const inSection = items.filter((x) => x.groupId === s.id);
        if (!inSection.length) return null;
        return (
          <div key={s.id ?? 'church'} className="space-y-1">
            <h3 className="flex items-center gap-1.5 font-medium text-muted-foreground text-sm">
              {s.id ? <Users className="size-4" aria-hidden /> : null}
              {s.name}
            </h3>
            <ul className="divide-y divide-border/70">
              {inSection.map((item, i) => {
                const at = items.indexOf(item);
                const swap = (other?: T) =>
                  other && setItems(move(items, at, items.indexOf(other) - at));
                return renderRow(item, {
                  first: i === 0,
                  last: i === inSection.length - 1,
                  up: () => swap(inSection[i - 1]),
                  down: () => swap(inSection[i + 1]),
                });
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function GroupHint() {
  return (
    <p className="text-pretty text-muted-foreground text-sm">
      Para juntar os contatos e as redes de alguém, preencha{' '}
      <strong className="font-medium text-foreground">
        Pessoa ou ministério
      </strong>{' '}
      (ex.: Pastor Marcos). Sem isso, o item é da igreja e aparece primeiro.
    </p>
  );
}

export function GroupedContactsEditor({ c }: { c: SettingsController }) {
  const [confirming, setConfirming] = React.useState<Contact | null>(null);
  const contacts = c.form.contacts;
  const update = (id: string, p: Partial<Contact>) =>
    c.setForm((f) => ({
      ...f,
      contacts: f.contacts.map((x) => (x.id === id ? { ...x, ...p } : x)),
    }));
  const add = (kind: Contact['kind']) =>
    c.setForm((f) => ({
      ...f,
      contacts: [
        ...f.contacts,
        {
          id: newId(),
          kind,
          value: '',
          label: '',
          isWhatsApp: false,
          isPublic: false,
          groupId: null,
        },
      ],
    }));
  const addButtons = (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => add('phone')}>
        <Plus /> Telefone
      </Button>
      <Button variant="outline" onClick={() => add('email')}>
        <Plus /> E-mail
      </Button>
    </div>
  );
  if (!contacts.length) {
    return (
      <EmptyList
        icon={<Phone className="size-4" />}
        text="Nenhum contato ainda. Telefones e e-mails ficam privados até você torná-los públicos."
        action={addButtons}
      />
    );
  }
  return (
    <div className="space-y-4">
      <GroupHint />
      <GroupedRows
        c={c}
        items={contacts}
        setItems={(next) => c.patch({ contacts: next })}
        renderRow={(ct, m) => {
          const key = `contacts.${ct.id}.value`;
          const err = c.errors[key];
          const Icon = ct.kind === 'phone' ? Phone : Mail;
          return (
            <li
              key={ct.id}
              className={cn(
                'space-y-2 py-3',
                err && '-mx-2 rounded-md bg-destructive/5 px-2',
              )}
            >
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
                <div className="space-y-1">
                  <div className="relative">
                    <Icon
                      className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      className="pl-8"
                      aria-label={ct.kind === 'phone' ? 'Telefone' : 'E-mail'}
                      aria-invalid={!!err}
                      placeholder={
                        ct.kind === 'phone'
                          ? '(11) 98765-4321'
                          : 'nome@igreja.org.br'
                      }
                      value={ct.value}
                      onChange={(e) => {
                        update(ct.id, { value: e.target.value });
                        c.clearError(key);
                      }}
                    />
                  </div>
                  <FieldError message={err} />
                </div>
                <Input
                  aria-label="Descrição"
                  placeholder="Descrição (ex.: Secretaria)"
                  value={ct.label}
                  onChange={(e) => update(ct.id, { label: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <PersonField c={c} kind="contacts" item={ct} />
                {ct.kind === 'phone' ? (
                  // biome-ignore lint/a11y/noLabelWithoutControl: wraps the design-system Checkbox
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={ct.isWhatsApp}
                      onCheckedChange={(on) =>
                        update(ct.id, { isWhatsApp: !!on })
                      }
                    />
                    WhatsApp
                  </label>
                ) : null}
                <div className="flex items-center gap-2 text-sm">
                  <Switch
                    aria-label="Público"
                    checked={ct.isPublic}
                    onCheckedChange={(on) =>
                      on
                        ? setConfirming(ct)
                        : update(ct.id, { isPublic: false })
                    }
                  />
                  <span
                    aria-hidden
                    className={cn(
                      'flex items-center gap-1',
                      !ct.isPublic && 'text-muted-foreground',
                    )}
                  >
                    {ct.isPublic ? null : <Lock className="size-3.5" />}
                    {ct.isPublic ? 'Público' : 'Privado'}
                  </span>
                </div>
                <RowActions
                  first={m.first}
                  last={m.last}
                  onUp={m.up}
                  onDown={m.down}
                  removeLabel="Remover contato"
                  onRemove={() =>
                    c.setForm((f) =>
                      pruneGroups({
                        ...f,
                        contacts: f.contacts.filter((x) => x.id !== ct.id),
                      }),
                    )
                  }
                />
              </div>
            </li>
          );
        }}
      />
      {addButtons}
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

function NetworkTag({ url }: { url: string }) {
  const d = detectNetwork(url);
  if (!d) return <span className="text-muted-foreground text-sm">Rede</span>;
  if ('error' in d) return <Badge variant="destructive">Não reconhecida</Badge>;
  return <Badge variant="secondary">{d.network}</Badge>;
}

export function GroupedLinksEditor({ c }: { c: SettingsController }) {
  const links = c.form.links;
  const update = (id: string, p: Partial<SocialLink>) =>
    c.setForm((f) => ({
      ...f,
      links: f.links.map((x) => (x.id === id ? { ...x, ...p } : x)),
    }));
  const addButton = (
    <Button
      variant="outline"
      className="w-fit"
      onClick={() =>
        c.setForm((f) => ({
          ...f,
          links: [
            ...f.links,
            { id: newId(), url: '', label: '', groupId: null },
          ],
        }))
      }
    >
      <Plus /> Rede social
    </Button>
  );
  if (!links.length) {
    return (
      <EmptyList
        icon={<Users className="size-4" />}
        text="Nenhuma rede social ainda. Cole o endereço e a rede é reconhecida sozinha."
        action={addButton}
      />
    );
  }
  return (
    <div className="space-y-4">
      <GroupedRows
        c={c}
        items={links}
        setItems={(next) => c.patch({ links: next })}
        renderRow={(l, m) => {
          const key = `links.${l.id}.url`;
          const d = detectNetwork(l.url);
          const err =
            c.errors[key] ?? (d && 'error' in d ? d.error : undefined);
          return (
            <li
              key={l.id}
              className={cn(
                'space-y-2 py-3',
                err && '-mx-2 rounded-md bg-destructive/5 px-2',
              )}
            >
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
                <div className="space-y-1">
                  <Input
                    aria-label="Endereço da rede social"
                    aria-invalid={!!err}
                    placeholder="https://instagram.com/suaigreja"
                    value={l.url}
                    onChange={(e) => {
                      update(l.id, { url: e.target.value });
                      c.clearError(key);
                    }}
                  />
                  <FieldError message={err} />
                </div>
                <Input
                  aria-label="Descrição"
                  placeholder="Descrição (opcional)"
                  value={l.label}
                  onChange={(e) => update(l.id, { label: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <NetworkTag url={l.url} />
                <PersonField c={c} kind="links" item={l} />
                <RowActions
                  first={m.first}
                  last={m.last}
                  onUp={m.up}
                  onDown={m.down}
                  removeLabel="Remover rede social"
                  onRemove={() =>
                    c.setForm((f) =>
                      pruneGroups({
                        ...f,
                        links: f.links.filter((x) => x.id !== l.id),
                      }),
                    )
                  }
                />
              </div>
            </li>
          );
        }}
      />
      {addButton}
    </div>
  );
}

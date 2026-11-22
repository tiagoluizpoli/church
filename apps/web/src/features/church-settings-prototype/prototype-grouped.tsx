// PROTOTYPE, throwaway (wayfinder #980, round 4): Contact Groups as a field on each row.
// Typing a new "Pessoa ou ministério" creates the group; a group nobody uses disappears.
// Ungrouped items belong to the church and come first. Two-line rows, design-system controls, touch sizing.
// Round 4: every input carries its icon inside (IconInput), phones say Celular or Fixo, and a social link
// starts from a chosen network (menu + per-row selector that pre-fills the address; detection stays authoritative).
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Link2,
  Lock,
  Mail,
  Phone,
  Plus,
  Smartphone,
  Tag,
  Trash2,
  Users,
} from 'lucide-react';
import * as React from 'react';
import { Confirm, EmptyList, FieldError, IconInput } from './prototype-editors';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFormControlSize } from '@/components/ui/form-control-size';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export { IconInput };

import {
  type Contact,
  detectNetwork,
  type LinkGroup,
  move,
  NETWORKS,
  newId,
  type SettingsController,
  type SettingsForm,
  type SocialLink,
} from './prototype-state';

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
    <>
      <IconInput
        icon={Users}
        wrapperClassName="flex-1 basis-56 sm:max-w-72"
        aria-label="Pessoa ou ministério"
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
    </>
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

type ContactType = 'mobile' | 'landline' | 'email';

const typeOf = (ct: Contact): ContactType =>
  ct.kind === 'email'
    ? 'email'
    : ct.phoneType === 'landline'
      ? 'landline'
      : 'mobile';

// Same leading choice on every contact row, so every value box starts at the same place.
function ContactTypeChoice({
  value,
  onChange,
}: {
  value: ContactType;
  onChange: (v: ContactType) => void;
}) {
  return (
    <RadioGroup
      aria-label="Tipo de contato"
      value={value}
      onValueChange={(v) => onChange(v as ContactType)}
      className="flex h-full items-center gap-4"
    >
      {(
        [
          ['mobile', 'Celular'],
          ['landline', 'Fixo'],
          ['email', 'E-mail'],
        ] as const
      ).map(([v, label]) => (
        // biome-ignore lint/a11y/noLabelWithoutControl: wraps the design-system radio
        <label
          key={v}
          className="flex min-h-11 items-center gap-2 text-sm md:min-h-0"
        >
          <RadioGroupItem value={v} />
          {label}
        </label>
      ))}
    </RadioGroup>
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
          phoneType: kind === 'phone' ? 'mobile' : undefined,
          value: '',
          label: '',
          isWhatsApp: false,
          isPublic: false,
          groupId: null,
        },
      ],
    }));
  const addButtons = (
    <Button variant="outline" className="w-fit" onClick={() => add('phone')}>
      <Plus /> Contato
    </Button>
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
          const mobile = ct.phoneType !== 'landline';
          const icon = ct.kind === 'email' ? Mail : mobile ? Smartphone : Phone;
          return (
            <li
              key={ct.id}
              className={cn(
                'space-y-2 py-3',
                err && '-mx-2 rounded-md bg-destructive/5 px-2',
              )}
            >
              <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_14rem] sm:items-start">
                <div className="sm:h-8 sm:pr-2">
                  <ContactTypeChoice
                    value={typeOf(ct)}
                    onChange={(t) => {
                      update(
                        ct.id,
                        t === 'email'
                          ? {
                              kind: 'email',
                              phoneType: undefined,
                              isWhatsApp: false,
                            }
                          : { kind: 'phone', phoneType: t },
                      );
                      c.clearError(key);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <IconInput
                    icon={icon}
                    aria-label={ct.kind === 'phone' ? 'Telefone' : 'E-mail'}
                    aria-invalid={!!err}
                    inputMode={ct.kind === 'phone' ? 'tel' : 'email'}
                    placeholder={
                      ct.kind === 'email'
                        ? 'nome@igreja.org.br'
                        : mobile
                          ? '(11) 98765-4321'
                          : '(11) 3456-7890'
                    }
                    value={ct.value}
                    onChange={(e) => {
                      update(ct.id, { value: e.target.value });
                      c.clearError(key);
                    }}
                  />
                  <FieldError message={err} />
                </div>
                <IconInput
                  icon={Tag}
                  aria-label="Descrição"
                  placeholder="Descrição (ex.: Secretaria)"
                  value={ct.label}
                  onChange={(e) => update(ct.id, { label: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <PersonField c={c} kind="contacts" item={ct} />
                {ct.kind === 'phone' ? (
                  <>
                    {/* biome-ignore lint/a11y/noLabelWithoutControl: wraps the design-system Checkbox */}
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={ct.isWhatsApp}
                        onCheckedChange={(on) =>
                          update(ct.id, { isWhatsApp: !!on })
                        }
                      />
                      WhatsApp
                    </label>
                  </>
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

const networkOf = (url: string) => {
  const d = detectNetwork(url);
  return d && 'network' in d ? d.network : null;
};

// Picking a network rewrites the address to that network's start; the detected network stays the truth.
function NetworkSelect({
  url,
  onPick,
  invalid,
}: {
  url: string;
  onPick: (start: string) => void;
  invalid: boolean;
}) {
  const current = networkOf(url);
  return (
    <Select
      value={current ?? ''}
      onValueChange={(name) => {
        const n = NETWORKS.find((x) => x.name === name);
        if (n && n.name !== current) onPick(n.start);
      }}
    >
      <SelectTrigger
        aria-label="Rede social"
        aria-invalid={invalid}
        className="w-full sm:w-52"
      >
        <SelectValue>
          {current ?? (url.trim() ? 'Rede não reconhecida' : 'Escolha a rede')}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {NETWORKS.map((n) => (
          <SelectItem key={n.name} value={n.name}>
            {n.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function GroupedLinksEditor({ c }: { c: SettingsController }) {
  const links = c.form.links;
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const update = (id: string, p: Partial<SocialLink>) =>
    c.setForm((f) => ({
      ...f,
      links: f.links.map((x) => (x.id === id ? { ...x, ...p } : x)),
    }));
  const addWith = (start: string) => {
    const id = newId();
    c.setForm((f) => ({
      ...f,
      links: [...f.links, { id, url: start, label: '', groupId: null }],
    }));
    setFocusId(id);
  };
  const addMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" className="w-fit" />}
      >
        <Plus /> Rede social <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-80 w-56 overflow-y-auto"
      >
        {NETWORKS.map((n) => (
          <DropdownMenuItem key={n.name} onClick={() => addWith(n.start)}>
            {n.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onClick={() => addWith('')}>
          Colar um link…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
  if (!links.length) {
    return (
      <EmptyList
        icon={<Link2 className="size-4" />}
        text="Nenhuma rede social ainda. Escolha a rede ou cole o link, e ela é reconhecida sozinha."
        action={addMenu}
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
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <NetworkSelect
                  url={l.url}
                  invalid={!!err}
                  onPick={(start) => {
                    update(l.id, { url: start });
                    c.clearError(key);
                    setFocusId(l.id);
                  }}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <IconInput
                    icon={Link2}
                    aria-label="Link da rede social"
                    aria-invalid={!!err}
                    inputMode="url"
                    placeholder="Cole o link (ex.: https://instagram.com/suaigreja)"
                    value={l.url}
                    ref={(el) => {
                      if (el && focusId === l.id) {
                        el.focus();
                        el.setSelectionRange(el.value.length, el.value.length);
                        setFocusId(null);
                      }
                    }}
                    onChange={(e) => {
                      update(l.id, { url: e.target.value });
                      c.clearError(key);
                    }}
                  />
                  <FieldError message={err} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <IconInput
                  icon={Tag}
                  wrapperClassName="flex-1 basis-56 sm:max-w-72"
                  aria-label="Descrição"
                  placeholder="Descrição (opcional)"
                  value={l.label}
                  onChange={(e) => update(l.id, { label: e.target.value })}
                />
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
      {addMenu}
    </div>
  );
}

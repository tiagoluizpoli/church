// PROTOTYPE, throwaway (wayfinder #980, round 2): one set of groups shared by Contacts and Social Links.
// Ungrouped items belong to the church itself and come first; a group with no items of a kind is not shown in that list.
import {
  Globe,
  Lock,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import * as React from 'react';
import {
  Confirm,
  EmptyList,
  FieldError,
  NetworkBadge,
  RowMoves,
} from './prototype-editors';
import {
  type Contact,
  detectNetwork,
  move,
  newId,
  type SettingsController,
  type SocialLink,
} from './prototype-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const CHURCH = 'Da igreja';

function GroupSelect({
  c,
  value,
  onChange,
}: {
  c: SettingsController;
  value: string | null;
  onChange: (groupId: string | null) => void;
}) {
  return (
    <select
      className="h-9 w-36 shrink-0 rounded-md border bg-transparent px-2 text-sm"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      aria-label="Grupo"
    >
      <option value="">{CHURCH}</option>
      {c.form.groups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </select>
  );
}

// Renders items section by section (church first, then groups in their order), reordering within a section.
function GroupedRows<T extends { id: string; groupId: string | null }>({
  c,
  items,
  setItems,
  renderRow,
}: {
  c: SettingsController;
  items: T[];
  setItems: (next: T[]) => void;
  renderRow: (item: T, moves: React.ReactNode) => React.ReactNode;
}) {
  const sections = [
    { id: null as string | null, name: CHURCH },
    ...c.form.groups,
  ];
  return (
    <div className="space-y-3">
      {sections.map((s) => {
        const inSection = items.filter((x) => x.groupId === s.id);
        if (!inSection.length) return null;
        return (
          <div key={s.id ?? 'church'} className="space-y-1.5">
            <p className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
              {s.id ? <Users className="size-3.5" /> : null}
              {s.name}
            </p>
            <ul className="divide-y rounded-lg border">
              {inSection.map((item, i) => {
                const at = items.indexOf(item);
                const swap = (other?: T) =>
                  other && setItems(move(items, at, items.indexOf(other) - at));
                return renderRow(
                  item,
                  <RowMoves
                    first={i === 0}
                    last={i === inSection.length - 1}
                    onUp={() => swap(inSection[i - 1])}
                    onDown={() => swap(inSection[i + 1])}
                  />,
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function GroupedContactsEditor({ c }: { c: SettingsController }) {
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
          groupId: null,
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
  if (!contacts.length) {
    return (
      <EmptyList
        icon={<Phone className="size-4" />}
        text="Nenhum contato. Ficam privados até você torná-los públicos."
        action={addButtons}
      />
    );
  }
  return (
    <div className="space-y-3">
      <GroupedRows
        c={c}
        items={contacts}
        setItems={(next) => c.patch({ contacts: next })}
        renderRow={(ct, moves) => {
          const err = c.errors[`contacts.${ct.id}.value`];
          const Icon = ct.kind === 'phone' ? Phone : Mail;
          return (
            <li
              key={ct.id}
              className={cn(
                'flex flex-wrap items-start gap-2 p-2',
                err && 'bg-destructive/5',
              )}
            >
              {moves}
              <div className="min-w-48 flex-1 space-y-1">
                <div className="relative">
                  <Icon className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    aria-invalid={!!err}
                    placeholder={
                      ct.kind === 'phone'
                        ? '(11) 98765-4321'
                        : 'nome@igreja.org.br'
                    }
                    value={ct.value}
                    onChange={(e) => update(ct.id, { value: e.target.value })}
                  />
                </div>
                <FieldError message={err} />
              </div>
              <Input
                className="w-40"
                placeholder="Rótulo (ex.: Secretaria)"
                value={ct.label}
                onChange={(e) => update(ct.id, { label: e.target.value })}
              />
              <GroupSelect
                c={c}
                value={ct.groupId}
                onChange={(groupId) => update(ct.id, { groupId })}
              />
              <div className="flex items-center gap-3 pt-1.5">
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
                <label className="flex w-24 items-center gap-1.5 text-sm">
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

export function GroupedLinksEditor({ c }: { c: SettingsController }) {
  const links = c.form.links;
  const update = (id: string, p: Partial<SocialLink>) =>
    c.patch({ links: links.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const addButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        c.patch({
          links: [...links, { id: newId(), url: '', label: '', groupId: null }],
        })
      }
    >
      <Plus /> Adicionar link
    </Button>
  );
  if (!links.length) {
    return (
      <EmptyList
        icon={<Globe className="size-4" />}
        text="Nenhuma rede social. Cole o endereço e a rede é reconhecida sozinha."
        action={addButton}
      />
    );
  }
  return (
    <div className="space-y-3">
      <GroupedRows
        c={c}
        items={links}
        setItems={(next) => c.patch({ links: next })}
        renderRow={(l, moves) => {
          const d = detectNetwork(l.url);
          const err =
            c.errors[`links.${l.id}.url`] ??
            (d && 'error' in d ? d.error : undefined);
          return (
            <li
              key={l.id}
              className={cn(
                'flex flex-wrap items-start gap-2 p-2',
                err && 'bg-destructive/5',
              )}
            >
              {moves}
              <div className="w-28 shrink-0 pt-1.5">
                <NetworkBadge url={l.url} />
              </div>
              <div className="min-w-48 flex-1 space-y-1">
                <Input
                  aria-invalid={!!err}
                  placeholder="https://instagram.com/suaigreja"
                  value={l.url}
                  onChange={(e) => update(l.id, { url: e.target.value })}
                />
                <FieldError message={err} />
              </div>
              <Input
                className="w-40"
                placeholder="Descrição (opcional)"
                value={l.label}
                onChange={(e) => update(l.id, { label: e.target.value })}
              />
              <GroupSelect
                c={c}
                value={l.groupId}
                onChange={(groupId) => update(l.id, { groupId })}
              />
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
        }}
      />
      {addButton}
    </div>
  );
}

export function GroupsEditor({ c }: { c: SettingsController }) {
  const { groups, contacts, links } = c.form;
  const add = (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        c.patch({ groups: [...groups, { id: newId(), name: 'Novo grupo' }] })
      }
    >
      <Plus /> Novo grupo
    </Button>
  );
  if (!groups.length) {
    return (
      <EmptyList
        icon={<Users className="size-4" />}
        text="Sem grupos: tudo aparece como da igreja. Crie um grupo para juntar os contatos e redes de uma pessoa ou ministério."
        action={add}
      />
    );
  }
  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-lg border">
        {groups.map((g, i) => {
          const nContacts = contacts.filter((x) => x.groupId === g.id).length;
          const nLinks = links.filter((x) => x.groupId === g.id).length;
          return (
            <li key={g.id} className="flex items-center gap-2 p-2">
              <RowMoves
                first={i === 0}
                last={i === groups.length - 1}
                onUp={() => c.patch({ groups: move(groups, i, -1) })}
                onDown={() => c.patch({ groups: move(groups, i, 1) })}
              />
              <Input
                className="max-w-64 font-medium"
                value={g.name}
                onChange={(e) =>
                  c.patch({
                    groups: groups.map((x) =>
                      x.id === g.id ? { ...x, name: e.target.value } : x,
                    ),
                  })
                }
              />
              <span className="flex-1 text-muted-foreground text-sm">
                {nContacts} {nContacts === 1 ? 'contato' : 'contatos'} ·{' '}
                {nLinks} {nLinks === 1 ? 'rede' : 'redes'}
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Remover grupo"
                onClick={() =>
                  c.patch({
                    groups: groups.filter((x) => x.id !== g.id),
                    contacts: contacts.map((x) =>
                      x.groupId === g.id ? { ...x, groupId: null } : x,
                    ),
                    links: links.map((x) =>
                      x.groupId === g.id ? { ...x, groupId: null } : x,
                    ),
                  })
                }
              >
                <Trash2 />
              </Button>
            </li>
          );
        })}
      </ul>
      {add}
    </div>
  );
}

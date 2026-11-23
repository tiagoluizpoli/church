import type { ChurchSettingsForm } from '@/features/church-settings/church-settings-form';

type GroupedForm = Pick<
  ChurchSettingsForm,
  'contacts' | 'socialLinks' | 'contactGroups'
>;

interface GroupNameInput {
  name: string;
}

/** A name as the server keeps it: trimmed, inner spaces collapsed. */
function clean({ name }: GroupNameInput): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Two spellings differing only in case are one group, as on the server. */
function keyOf({ name }: GroupNameInput): string {
  return clean({ name }).toLocaleLowerCase('pt-BR');
}

interface FormInput {
  form: GroupedForm;
}

/** The groups in use, in display order: the saved order first, then new ones in first-use order. Ungrouped ("Da igreja") is not listed. */
export function groupOrder({ form }: FormInput): string[] {
  const members = [
    ...form.contacts.map(({ group }) => group),
    ...form.socialLinks.map(({ group }) => group),
  ];
  const used = new Set(
    members.filter((name) => clean({ name })).map((name) => keyOf({ name })),
  );
  const ordered = new Map<string, string>();
  for (const typed of [...form.contactGroups, ...members]) {
    const name = clean({ name: typed });
    const key = keyOf({ name });
    if (name && used.has(key) && !ordered.has(key)) ordered.set(key, name);
  }
  return [...ordered.values()];
}

interface RenameInput extends FormInput {
  from: string;
  to: string;
}

/** Renames a group on every member (an empty name is refused, a name already in use merges). */
export function renameGroup({
  form,
  from,
  to,
}: RenameInput): Pick<
  ChurchSettingsForm,
  'contacts' | 'socialLinks' | 'contactGroups'
> {
  const target = clean({ name: to });
  const fromKey = keyOf({ name: from });
  const order = groupOrder({ form });
  if (!target) return { ...form, contactGroups: order };
  const rename = <T extends GroupedRow>(rows: T[]): T[] =>
    rows.map((row) =>
      keyOf({ name: row.group }) === fromKey ? { ...row, group: target } : row,
    );
  return {
    contacts: rename(form.contacts),
    socialLinks: rename(form.socialLinks),
    contactGroups: order.map((name) =>
      keyOf({ name }) === fromKey ? target : name,
    ),
  };
}

interface MoveInput extends FormInput {
  name: string;
  by: -1 | 1;
}

/** The whole group order with one group moved a step. */
export function moveGroup({ form, name, by }: MoveInput): string[] {
  const order = groupOrder({ form });
  const index = order.findIndex(
    (other) => keyOf({ name: other }) === keyOf({ name }),
  );
  const target = index + by;
  if (index < 0 || target < 0 || target >= order.length) return order;
  const next = [...order];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved as string);
  return next;
}

/** A contact or Social Link row, by the group it names. */
interface GroupedRow {
  group: string;
}

interface MembersOfInput<T> {
  rows: T[];
  /** `null` is the ungrouped block. */
  name: string | null;
}

/** One block of the preview: a group's rows, in the form's order. */
export function membersOf<T extends GroupedRow>({
  rows,
  name,
}: MembersOfInput<T>): T[] {
  return rows.filter(({ group }) =>
    name === null
      ? clean({ name: group }) === ''
      : keyOf({ name: group }) === keyOf({ name }),
  );
}

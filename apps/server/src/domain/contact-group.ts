import { z } from 'zod';

export const CONTACT_GROUP_NAME_MAX = 60;
export const CONTACT_GROUPS_MAX = 100;

interface NormalizeGroupNameInput {
  name: string | null | undefined;
}

/** Trimmed, inner whitespace collapsed; empty means ungrouped (`null`). */
export function normalizeGroupName({
  name,
}: NormalizeGroupNameInput): string | null {
  return name?.trim().replace(/\s+/g, ' ') || null;
}

/** A row's *Pessoa ou ministério*; empty means the row is ungrouped ("Da igreja"). */
export const contactGroupNameSchema = z
  .string()
  .nullish()
  .transform((name) => normalizeGroupName({ name }))
  .pipe(
    z.string().max(CONTACT_GROUP_NAME_MAX, 'CONTACT_GROUP_TOO_LONG').nullable(),
  );

/** The requested group order: names as typed, normalised on save. */
export const contactGroupOrderSchema = z
  .array(z.string().max(CONTACT_GROUP_NAME_MAX * 2))
  .max(CONTACT_GROUPS_MAX);

interface GroupKeyInput {
  name: string;
}

/** Two spellings of one name (case only) are one group. */
export function contactGroupKey({ name }: GroupKeyInput): string {
  return name.toLocaleLowerCase('pt-BR');
}

interface ResolveContactGroupsInput {
  /** The order the admin asked for, first; names not listed follow in first-use order. */
  requested: readonly string[];
  /** The group of every contact and link; a group nobody uses is dropped. */
  members: readonly (string | null)[];
}

/** The groups to keep, in order, each under the first spelling seen. */
export function resolveContactGroups({
  requested,
  members,
}: ResolveContactGroupsInput): string[] {
  const used = new Set(
    members.flatMap((name) => (name ? [contactGroupKey({ name })] : [])),
  );
  const ordered = new Map<string, string>();
  for (const typed of [...requested, ...members]) {
    const name = normalizeGroupName({ name: typed });
    if (!name) continue;
    const key = contactGroupKey({ name });
    if (used.has(key) && !ordered.has(key)) ordered.set(key, name);
  }
  return [...ordered.values()];
}

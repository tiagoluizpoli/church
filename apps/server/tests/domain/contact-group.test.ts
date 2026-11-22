import { describe, expect, it } from 'vitest';
import {
  CONTACT_GROUP_NAME_MAX,
  contactGroupNameSchema,
  resolveContactGroups,
} from '@/domain/contact-group';

describe('contactGroupNameSchema', () => {
  it('trims, collapses spaces and turns empty into ungrouped', () => {
    expect(contactGroupNameSchema.parse('  Pr.  João  ')).toBe('Pr. João');
    expect(contactGroupNameSchema.parse('   ')).toBeNull();
    expect(contactGroupNameSchema.parse(undefined)).toBeNull();
  });

  it('refuses a name over the limit', () => {
    const result = contactGroupNameSchema.safeParse(
      'a'.repeat(CONTACT_GROUP_NAME_MAX + 1),
    );
    expect(result.error?.issues[0]?.message).toBe('CONTACT_GROUP_TOO_LONG');
  });
});

describe('resolveContactGroups', () => {
  it('keeps the requested order and appends unlisted groups in first-use order', () => {
    expect(
      resolveContactGroups({
        requested: ['Louvor', 'Jovens'],
        members: ['Jovens', null, 'Mídia', 'Louvor'],
      }),
    ).toEqual(['Louvor', 'Jovens', 'Mídia']);
  });

  it('drops a group with no member and ignores blank names', () => {
    expect(
      resolveContactGroups({
        requested: ['Vazio', ' ', 'Louvor'],
        members: ['Louvor', null],
      }),
    ).toEqual(['Louvor']);
  });

  it('treats names differing only in case as one group, under the first spelling', () => {
    expect(
      resolveContactGroups({
        requested: [],
        members: ['Louvor', 'louvor', ' LOUVOR '],
      }),
    ).toEqual(['Louvor']);
  });
});

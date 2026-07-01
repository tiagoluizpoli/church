import { describe, expect, it } from 'vitest';
import {
  RoleTemplate,
  RoleTemplateItem,
} from '../../../src/domain/entities/role-template';
import { InvalidRequiredCountError } from '../../../src/domain/errors/invalid-required-count';

describe('RoleTemplate entities', () => {
  it('validates item count and exposes item properties', () => {
    expect(
      () =>
        new RoleTemplateItem({
          churchId: 'church-1',
          templateId: 'template-1',
          roleId: 'role-1',
          requiredCount: 0,
        }),
    ).toThrow(InvalidRequiredCountError);

    const item = new RoleTemplateItem({
      churchId: 'church-1',
      templateId: 'template-1',
      roleId: 'role-1',
      requiredCount: 2,
    });

    expect(item.churchId).toBe('church-1');
    expect(item.templateId).toBe('template-1');
    expect(item.roleId).toBe('role-1');
    expect(item.requiredCount).toBe(2);
  });

  it('defaults items and preserves supplied items', () => {
    const empty = new RoleTemplate({
      churchId: 'church-1',
      ministryId: 'ministry-1',
      name: 'Default',
    });
    const item = new RoleTemplateItem({
      churchId: 'church-1',
      templateId: empty.id,
      roleId: 'role-1',
      requiredCount: 1,
    });
    const populated = new RoleTemplate({
      churchId: 'church-1',
      ministryId: 'ministry-1',
      name: 'Populated',
      items: [item],
    });

    expect(empty.items).toEqual([]);
    expect(populated.churchId).toBe('church-1');
    expect(populated.ministryId).toBe('ministry-1');
    expect(populated.name).toBe('Populated');
    expect(populated.items).toEqual([item]);
  });
});

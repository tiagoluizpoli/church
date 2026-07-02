import type { BrandedId } from '@church/core';

export type RoleTemplateId = BrandedId<'RoleTemplateId'>;
export namespace RoleTemplateId {
  export function from(raw: string): RoleTemplateId {
    return raw as RoleTemplateId;
  }
}

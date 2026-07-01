import type { BrandedId } from '@church/core';

export type RoleId = BrandedId<'RoleId'>;
export namespace RoleId {
  export function from(raw: string): RoleId {
    return raw as RoleId;
  }
}

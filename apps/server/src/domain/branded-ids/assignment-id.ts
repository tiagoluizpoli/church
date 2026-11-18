import type { BrandedId } from '@church/core';

export type AssignmentId = BrandedId<'AssignmentId'>;
export namespace AssignmentId {
  export function from(raw: string): AssignmentId {
    return raw as AssignmentId;
  }
}

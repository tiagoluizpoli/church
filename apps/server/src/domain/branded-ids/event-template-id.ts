import type { BrandedId } from '@church/core';

export type EventTemplateId = BrandedId<'EventTemplateId'>;
export namespace EventTemplateId {
  export function from(raw: string): EventTemplateId {
    return raw as EventTemplateId;
  }
}

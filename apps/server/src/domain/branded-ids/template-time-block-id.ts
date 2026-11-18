import type { BrandedId } from '@church/core';

export type TemplateTimeBlockId = BrandedId<'TemplateTimeBlockId'>;
export namespace TemplateTimeBlockId {
  export function from(raw: string): TemplateTimeBlockId {
    return raw as TemplateTimeBlockId;
  }
}

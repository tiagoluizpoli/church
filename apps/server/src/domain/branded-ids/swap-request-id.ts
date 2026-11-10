import type { BrandedId } from '@church/core';

export type SwapRequestId = BrandedId<'SwapRequestId'>;
export namespace SwapRequestId {
  export function from(raw: string): SwapRequestId {
    return raw as SwapRequestId;
  }
}

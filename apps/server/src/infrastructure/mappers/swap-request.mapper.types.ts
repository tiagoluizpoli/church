import type { swapRequest } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';

export type SwapRequestRow = InferSelectModel<typeof swapRequest>;

export interface MapSwapRequestInput {
  row: SwapRequestRow;
}

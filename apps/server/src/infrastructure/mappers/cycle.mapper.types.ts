import type { cycle } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';

export type CycleRow = InferSelectModel<typeof cycle>;

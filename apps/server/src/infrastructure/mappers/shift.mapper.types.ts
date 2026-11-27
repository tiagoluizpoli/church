import type { shift } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';

export type ShiftRow = InferSelectModel<typeof shift>;

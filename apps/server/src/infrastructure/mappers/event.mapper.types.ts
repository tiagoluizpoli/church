import type { event } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';

export type EventRow = InferSelectModel<typeof event>;

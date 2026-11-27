import type { availabilityCheck } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';

export type AvailabilityCheckRow = InferSelectModel<typeof availabilityCheck>;

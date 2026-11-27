import type { ministry } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';

export type MinistryRow = InferSelectModel<typeof ministry>;

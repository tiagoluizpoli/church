import type { sector } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';

export type SectorRow = InferSelectModel<typeof sector>;

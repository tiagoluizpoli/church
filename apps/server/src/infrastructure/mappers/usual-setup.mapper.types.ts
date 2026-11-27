import type { usualSetup } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';

export type UsualSetupRow = InferSelectModel<typeof usualSetup>;

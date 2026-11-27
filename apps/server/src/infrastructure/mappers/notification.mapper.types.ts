import type { notification } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';

export type NotificationRow = InferSelectModel<typeof notification>;

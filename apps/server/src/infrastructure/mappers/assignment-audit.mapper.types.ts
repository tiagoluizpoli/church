import type { assignmentAudit } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';

export type AssignmentAuditRow = InferSelectModel<typeof assignmentAudit>;

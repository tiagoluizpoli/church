import { router } from '../trpc';
import { applyRoleTemplate } from './admin-leader/apply-role-template';
import { cancelEvent } from './admin-leader/cancel-event';
import { createAssignment } from './admin-leader/create-assignment';
import { createEvent } from './admin-leader/create-event';
import { createSlot } from './admin-leader/create-slot';
import { deleteAssignment } from './admin-leader/delete-assignment';
import { deleteRoleTemplate } from './admin-leader/delete-role-template';
import { deleteSlot } from './admin-leader/delete-slot';
import { generateSlots } from './admin-leader/generate-slots';
import { getScheduleBuilderData } from './admin-leader/get-schedule-builder-data';
import { listAuditLog } from './admin-leader/list-audit-log';
import { listEvents } from './admin-leader/list-events';
import { listMyMinistries } from './admin-leader/list-my-ministries';
import { listRoleTemplates } from './admin-leader/list-role-templates';
import { publishEvent } from './admin-leader/publish-event';
import { sendReminder } from './admin-leader/send-reminder';
import { updateSlot } from './admin-leader/update-slot';
import { upsertRoleTemplate } from './admin-leader/upsert-role-template';
import { upsertSlotRequirement } from './admin-leader/upsert-slot-requirement';

export const adminLeaderRouter = router({
  getScheduleBuilderData,
  upsertSlotRequirement,
  createAssignment,
  deleteAssignment,
  publishEvent,
  cancelEvent,
  createEvent,
  listEvents,
  listMyMinistries,
  createSlot,
  updateSlot,
  deleteSlot,
  generateSlots,
  listAuditLog,
  sendReminder,
  listRoleTemplates,
  upsertRoleTemplate,
  applyRoleTemplate,
  deleteRoleTemplate,
});

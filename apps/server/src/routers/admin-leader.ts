import { router } from '../trpc';
import { cancelEvent } from './admin-leader/cancel-event';
import { createAssignment } from './admin-leader/create-assignment';
import { deleteAssignment } from './admin-leader/delete-assignment';
import { getScheduleBuilderData } from './admin-leader/get-schedule-builder-data';
import { publishEvent } from './admin-leader/publish-event';
import { upsertSlotRequirement } from './admin-leader/upsert-slot-requirement';

export const adminLeaderRouter = router({
  getScheduleBuilderData,
  upsertSlotRequirement,
  createAssignment,
  deleteAssignment,
  publishEvent,
  cancelEvent,
});

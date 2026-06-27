import { router } from '../trpc';
import { respondToAssignment } from './volunteer/respond-to-assignment';

export const volunteerRouter = router({
  respondToAssignment,
});

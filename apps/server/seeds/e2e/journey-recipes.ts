import {
  type CreateJourneyRecipeInput,
  E2E_JOURNEY_RECIPE_NAMES,
  type E2eJourneyRecipeName,
} from './journey-keys';
import type { E2eJourneyRecipe } from './journey-recipe';

export type E2eJourneyRecipeFactory = (
  input: CreateJourneyRecipeInput,
) => E2eJourneyRecipe<unknown>;

/**
 * Every journey recipe the E2E loader can run, by name. Each entry imports
 * its recipe on demand: a recipe pulls in `@church/db`, whose entry validates
 * the server environment and opens a pool, and the loader must refuse a
 * wrong target before that happens.
 */
export const E2E_JOURNEY_RECIPES: Record<
  E2eJourneyRecipeName,
  () => Promise<E2eJourneyRecipeFactory>
> = {
  [E2E_JOURNEY_RECIPE_NAMES.volunteerAssignments]: async () =>
    (await import('./recipes/volunteer-assignments'))
      .createVolunteerAssignmentsRecipe,
  [E2E_JOURNEY_RECIPE_NAMES.schedulePublish]: async () =>
    (await import('./recipes/schedule-publish')).createSchedulePublishRecipe,
  [E2E_JOURNEY_RECIPE_NAMES.volunteerDashboard]: async () =>
    (await import('./recipes/volunteer-dashboard'))
      .createVolunteerDashboardRecipe,
  [E2E_JOURNEY_RECIPE_NAMES.leaderPrepare]: async () =>
    (await import('./recipes/leader-prepare')).createLeaderPrepareRecipe,
  [E2E_JOURNEY_RECIPE_NAMES.volunteerAvailability]: async () =>
    (await import('./recipes/volunteer-availability'))
      .createVolunteerAvailabilityRecipe,
  [E2E_JOURNEY_RECIPE_NAMES.liveChanges]: async () =>
    (await import('./recipes/live-changes')).createLiveChangesRecipe,
  [E2E_JOURNEY_RECIPE_NAMES.assignBoard]: async () =>
    (await import('./recipes/assign-board')).createAssignBoardRecipe,
  [E2E_JOURNEY_RECIPE_NAMES.assignQualification]: async () =>
    (await import('./recipes/assign-qualification'))
      .createAssignQualificationRecipe,
  [E2E_JOURNEY_RECIPE_NAMES.activeChurchSwitching]: async () =>
    (await import('./recipes/active-church-switching'))
      .createActiveChurchSwitchingRecipe,
  [E2E_JOURNEY_RECIPE_NAMES.volunteerTransfer]: async () =>
    (await import('./recipes/volunteer-transfer'))
      .createVolunteerTransferRecipe,
  [E2E_JOURNEY_RECIPE_NAMES.ministryRedemption]: async () =>
    (await import('./recipes/ministry-redemption'))
      .createMinistryRedemptionRecipe,
  [E2E_JOURNEY_RECIPE_NAMES.crossTenantInvitation]: async () =>
    (await import('./recipes/cross-tenant-invitation'))
      .createCrossTenantInvitationRecipe,
  [E2E_JOURNEY_RECIPE_NAMES.planningAdmin]: async () =>
    (await import('./recipes/planning-admin')).createPlanningAdminRecipe,
  [E2E_JOURNEY_RECIPE_NAMES.eventTemplates]: async () =>
    (await import('./recipes/event-templates')).createEventTemplatesRecipe,
  [E2E_JOURNEY_RECIPE_NAMES.cycleAccess]: async () =>
    (await import('./recipes/cycle-access')).createCycleAccessRecipe,
  [E2E_JOURNEY_RECIPE_NAMES.cycleTenants]: async () =>
    (await import('./recipes/cycle-tenants')).createCycleTenantsRecipe,
  [E2E_JOURNEY_RECIPE_NAMES.ministryWorkspaceIndex]: async () =>
    (await import('./recipes/ministry-workspace-index'))
      .createMinistryWorkspaceIndexRecipe,
  [E2E_JOURNEY_RECIPE_NAMES.sharedPersonas]: async () =>
    (await import('./recipes/shared-personas')).createSharedPersonasRecipe,
};

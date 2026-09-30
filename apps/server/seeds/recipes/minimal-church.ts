import { addChurchMember } from '@church/db';
import { hashPassword } from 'better-auth/crypto';
import { SEED_PERSONA_PASSWORD } from '../blueprints/credentials';
import { MINIMAL_CHURCH_BLUEPRINT } from '../blueprints/minimal-church';
import {
  buildProvisionedChurch,
  redeemChurchInvitation,
} from '../builders/church';
import { buildAuthenticatableUser } from '../builders/identity';
import { buildMinistry, buildRole, buildTeam } from '../builders/ministry';
import { buildMinistryMembership, buildVolunteer } from '../builders/volunteer';
import type {
  SeededChurchSummary,
  SeedRecipe,
  SeedRecipeLoadInput,
} from '../recipe';

export interface SeededPersona {
  userId: string;
  email: string;
  password: string;
}

export interface SeededVolunteerPersona extends SeededPersona {
  volunteerId: string;
  ministryMembershipId: string;
}

export interface SeededMinistrySummary {
  id: string;
  teamId: string;
  roleId: string;
}

export interface MinimalChurchPersonas {
  churchAdmin: SeededPersona;
  volunteer: SeededVolunteerPersona;
}

export interface MinimalChurchRecipeResult {
  church: SeededChurchSummary;
  ministry: SeededMinistrySummary;
  personas: MinimalChurchPersonas;
}

async function loadMinimalChurch({
  db,
}: SeedRecipeLoadInput): Promise<MinimalChurchRecipeResult> {
  const blueprint = MINIMAL_CHURCH_BLUEPRINT;
  const passwordHash = await hashPassword(SEED_PERSONA_PASSWORD);

  const { church, adminInvitationId } = await buildProvisionedChurch({
    db,
    ...blueprint.church,
    adminEmail: blueprint.personas.churchAdmin.email,
  });

  const churchAdmin = await buildAuthenticatableUser({
    db,
    id: blueprint.personas.churchAdmin.userId,
    name: blueprint.personas.churchAdmin.name,
    email: blueprint.personas.churchAdmin.email,
    passwordHash,
  });
  await redeemChurchInvitation({
    db,
    invitationId: adminInvitationId,
    userId: churchAdmin.id,
    churchMembershipId: blueprint.personas.churchAdmin.churchMembershipId,
  });

  const ministry = await buildMinistry({
    db,
    churchId: church.id,
    id: blueprint.ministry.id,
    name: blueprint.ministry.name,
  });
  const team = await buildTeam({
    db,
    churchId: church.id,
    ministryId: ministry.id,
    ...blueprint.ministry.team,
  });
  const role = await buildRole({
    db,
    churchId: church.id,
    ministryId: ministry.id,
    ...blueprint.ministry.role,
  });

  const volunteerPersona = blueprint.personas.volunteer;
  const volunteerUser = await buildAuthenticatableUser({
    db,
    id: volunteerPersona.userId,
    name: volunteerPersona.name,
    email: volunteerPersona.email,
    passwordHash,
  });
  // Direct-state, bulk-data purpose: a Volunteer's real origin is a redeemed
  // Ministry Invitation, a per-person HTTP journey a seed cannot drive at
  // scale. Only the ChurchAdmin, whose origin is Church Provisioning, goes
  // through the invitation above.
  await addChurchMember({
    db,
    churchId: church.id,
    userId: volunteerUser.id,
    accessLevel: 'member',
    id: volunteerPersona.churchMembershipId,
  });
  const volunteer = await buildVolunteer({
    db,
    churchId: church.id,
    userId: volunteerUser.id,
    id: volunteerPersona.volunteerId,
  });
  const membership = await buildMinistryMembership({
    db,
    churchId: church.id,
    volunteerId: volunteer.id,
    ministryId: ministry.id,
    id: volunteerPersona.ministryMembershipId,
    ministryAccessLevel: 'volunteer',
    roleIds: [role.id],
    teams: [{ teamId: team.id, accessLevel: 'member' }],
  });

  return {
    church: { id: church.id, slug: church.slug },
    ministry: { id: ministry.id, teamId: team.id, roleId: role.id },
    personas: {
      churchAdmin: {
        userId: churchAdmin.id,
        email: churchAdmin.email,
        password: SEED_PERSONA_PASSWORD,
      },
      volunteer: {
        userId: volunteerUser.id,
        email: volunteerUser.email,
        password: SEED_PERSONA_PASSWORD,
        volunteerId: volunteer.id,
        ministryMembershipId: membership.id,
      },
    },
  };
}

export const minimalChurchRecipe: SeedRecipe<MinimalChurchRecipeResult> = {
  name: 'minimal-church',
  load: loadMinimalChurch,
};

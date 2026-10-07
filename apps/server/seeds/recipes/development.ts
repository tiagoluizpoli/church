import { addChurchMember } from '@church/db';
import type { CalendarDay } from '@church/time';
import { hashPassword } from 'better-auth/crypto';
import { SEED_PERSONA_PASSWORD } from '../blueprints/credentials';
import { DEVELOPMENT_BLUEPRINT } from '../blueprints/development';
import type {
  ChurchDirectoryBlueprint,
  KeyPersona,
  MinistryBlueprint,
  MinistrySeat,
  Person,
} from '../blueprints/directory/types';
import {
  buildProvisionedChurch,
  redeemChurchInvitation,
} from '../builders/church';
import { deriveSeedId } from '../builders/derived-id';
import { buildAuthenticatableUser } from '../builders/identity';
import { buildMinistry, buildRole, buildTeam } from '../builders/ministry';
import { buildMinistryMembership, buildVolunteer } from '../builders/volunteer';
import type { SeededChurchSummary, SeedRecipe, SeedWriter } from '../recipe';
import {
  loadGatherings,
  type SeededMinistryStructure,
} from './development-gatherings';
import {
  loadDevelopmentHistory,
  type SeededHistoricalCycle,
} from './development-history';

export interface CreateDevelopmentRecipeInput {
  /** The day date-sensitive data is derived from; fixed for reproduction. */
  anchor: CalendarDay;
}

export interface DevelopmentRecipeResult {
  anchor: CalendarDay;
  church: SeededChurchSummary;
  secondChurch: SeededChurchSummary;
  keyPersonas: readonly KeyPersona[];
  /** The previous complete month before the anchor's, locked and published. */
  historicalCycle: SeededHistoricalCycle;
}

/** Ids a blueprint does not name, keyed so the same entry always gets the same id. */
type SeededMinistryIds = SeededMinistryStructure;

interface ChurchDirectoryContext {
  db: SeedWriter;
  churchId: string;
  passwordHash: string;
  /** Every User this recipe created, across both Churches. */
  userIdByEmail: Map<string, string>;
}

interface PersonInput {
  context: ChurchDirectoryContext;
  person: Person;
}

async function buildPersonUser({
  context,
  person,
}: PersonInput): Promise<string> {
  const seededUser = await buildAuthenticatableUser({
    db: context.db,
    id: deriveSeedId({ kind: 'user', parentIds: [person.email] }),
    name: person.name,
    email: person.email,
    passwordHash: context.passwordHash,
  });
  context.userIdByEmail.set(seededUser.email, seededUser.id);
  return seededUser.id;
}

interface BuildMinistryStructureInput {
  context: ChurchDirectoryContext;
  ministry: MinistryBlueprint;
}

async function buildMinistryStructure({
  context: { db, churchId },
  ministry,
}: BuildMinistryStructureInput): Promise<SeededMinistryIds> {
  const seeded = await buildMinistry({
    db,
    churchId,
    id: deriveSeedId({
      kind: 'ministry',
      parentIds: [churchId, ministry.name],
    }),
    name: ministry.name,
  });

  const roleIdByName = new Map<string, string>();
  for (const name of ministry.roles) {
    const seededRole = await buildRole({
      db,
      churchId,
      ministryId: seeded.id,
      id: deriveSeedId({ kind: 'role', parentIds: [seeded.id, name] }),
      name,
    });
    roleIdByName.set(name, seededRole.id);
  }

  const teamIdByName = new Map<string, string>();
  for (const name of ministry.teams) {
    const seededTeam = await buildTeam({
      db,
      churchId,
      ministryId: seeded.id,
      id: deriveSeedId({ kind: 'team', parentIds: [seeded.id, name] }),
      name,
    });
    teamIdByName.set(name, seededTeam.id);
  }

  return { ministryId: seeded.id, roleIdByName, teamIdByName };
}

interface SeatVolunteerInput {
  context: ChurchDirectoryContext;
  ministry: SeededMinistryIds;
  volunteerId: string;
  seat: MinistrySeat<string, string>;
}

interface RequireIdInput {
  ids: Map<string, string>;
  key: string;
  description: string;
}

function requireId({ ids, key, description }: RequireIdInput): string {
  const id = ids.get(key);
  if (!id) {
    throw new Error(`Development blueprint names an unknown ${description}.`);
  }
  return id;
}

async function seatVolunteer({
  context: { db, churchId },
  ministry,
  volunteerId,
  seat,
}: SeatVolunteerInput): Promise<void> {
  await buildMinistryMembership({
    db,
    churchId,
    volunteerId,
    ministryId: ministry.ministryId,
    id: deriveSeedId({
      kind: 'ministry-membership',
      parentIds: [ministry.ministryId, volunteerId],
    }),
    ministryAccessLevel: seat.ministryLeader ? 'leader' : 'volunteer',
    roleIds: seat.roles.map((name) =>
      requireId({
        ids: ministry.roleIdByName,
        key: name,
        description: `Role ${name}`,
      }),
    ),
    teams: (seat.teams ?? []).map((teamSeat) => ({
      teamId: requireId({
        ids: ministry.teamIdByName,
        key: teamSeat.team,
        description: `Team ${teamSeat.team}`,
      }),
      accessLevel: teamSeat.teamLeader ? 'leader' : 'member',
    })),
  });
}

interface AddChurchMembershipInput {
  db: SeedWriter;
  churchId: string;
  userId: string;
}

/**
 * Direct-state, bulk-data purpose: a Volunteer's real origin is a redeemed
 * Ministry Invitation, a per-person HTTP journey a seed cannot drive at scale.
 */
async function addPlainChurchMembership({
  db,
  churchId,
  userId,
}: AddChurchMembershipInput): Promise<void> {
  await addChurchMember({
    db,
    churchId,
    userId,
    accessLevel: 'member',
    id: deriveSeedId({
      kind: 'church-membership',
      parentIds: [churchId, userId],
    }),
  });
}

interface LoadChurchDirectoryInput {
  db: SeedWriter;
  blueprint: ChurchDirectoryBlueprint;
  passwordHash: string;
  userIdByEmail: Map<string, string>;
}

/** One loaded Church directory, as the planning data built on it needs it. */
interface SeededChurchDirectory {
  church: SeededChurchSummary;
  ministries: Map<string, SeededMinistryIds>;
  volunteerIdByEmail: Map<string, string>;
}

async function loadChurchDirectory({
  db,
  blueprint,
  passwordHash,
  userIdByEmail,
}: LoadChurchDirectoryInput): Promise<SeededChurchDirectory> {
  const { church, adminInvitationId } = await buildProvisionedChurch({
    db,
    id: deriveSeedId({ kind: 'church', parentIds: [blueprint.church.slug] }),
    ...blueprint.church,
    adminEmail: blueprint.churchAdmin.email,
    adminInvitationId: deriveSeedId({
      kind: 'church-admin-invitation',
      parentIds: [blueprint.church.slug],
    }),
  });
  const context: ChurchDirectoryContext = {
    db,
    churchId: church.id,
    passwordHash,
    userIdByEmail,
  };

  // Church Provisioning's own origin: the ChurchAdmin redeems the invitation.
  const churchAdminId = await buildPersonUser({
    context,
    person: blueprint.churchAdmin,
  });
  await redeemChurchInvitation({
    db,
    invitationId: adminInvitationId,
    userId: churchAdminId,
    churchMembershipId: deriveSeedId({
      kind: 'church-membership',
      parentIds: [church.id, churchAdminId],
    }),
  });

  const ministryIdsByName = new Map<string, SeededMinistryIds>();
  const volunteerIdByEmail = new Map<string, string>();
  for (const ministry of blueprint.ministries) {
    const ministryIds = await buildMinistryStructure({ context, ministry });
    ministryIdsByName.set(ministry.name, ministryIds);

    for (const group of ministry.roster) {
      for (const person of group.people) {
        const userId = await buildPersonUser({ context, person });
        await addPlainChurchMembership({ db, churchId: church.id, userId });
        const seededVolunteer = await buildVolunteer({
          db,
          churchId: church.id,
          userId,
          id: deriveSeedId({
            kind: 'volunteer',
            parentIds: [church.id, userId],
          }),
        });
        volunteerIdByEmail.set(person.email, seededVolunteer.id);
        await seatVolunteer({
          context,
          ministry: ministryIds,
          volunteerId: seededVolunteer.id,
          seat: group.seat,
        });
      }
    }
  }

  for (const group of blueprint.crossMinistry) {
    const ministryIds = ministryIdsByName.get(group.ministry.name);
    if (!ministryIds) {
      throw new Error(
        `Cross-Ministry seat names Ministry ${group.ministry.name}, which ${blueprint.church.slug} does not have.`,
      );
    }
    for (const email of group.emails) {
      await seatVolunteer({
        context,
        ministry: ministryIds,
        volunteerId: requireId({
          ids: volunteerIdByEmail,
          key: email,
          description: `Volunteer ${email}`,
        }),
        seat: group.seat,
      });
    }
  }

  return {
    church: { id: church.id, slug: church.slug },
    ministries: ministryIdsByName,
    volunteerIdByEmail,
  };
}

/**
 * The scenario `db:reseed:dev` loads: the realistic Igreja Semente directory
 * and the small Igreja Colheita, joined by multi-Church Church Memberships.
 * Every id derives from the blueprint, so a reseed reproduces the same graph.
 */
export function createDevelopmentRecipe({
  anchor,
}: CreateDevelopmentRecipeInput): SeedRecipe<DevelopmentRecipeResult> {
  return {
    name: 'development',
    async load({ db }) {
      const blueprint = DEVELOPMENT_BLUEPRINT;
      // Hashed once and shared: hashing is deliberately slow.
      const passwordHash = await hashPassword(SEED_PERSONA_PASSWORD);
      const userIdByEmail = new Map<string, string>();

      const primary = await loadChurchDirectory({
        db,
        blueprint: blueprint.primary,
        passwordHash,
        userIdByEmail,
      });
      const { church: secondChurch } = await loadChurchDirectory({
        db,
        blueprint: blueprint.second,
        passwordHash,
        userIdByEmail,
      });
      const { church } = primary;

      const churchIdBySlug = new Map([
        [church.slug, church.id],
        [secondChurch.slug, secondChurch.id],
      ]);
      for (const group of blueprint.multiChurchMemberships) {
        const churchId = requireId({
          ids: churchIdBySlug,
          key: group.churchSlug,
          description: `Church ${group.churchSlug}`,
        });
        for (const email of group.emails) {
          await addPlainChurchMembership({
            db,
            churchId,
            userId: requireId({
              ids: userIdByEmail,
              key: email,
              description: `User ${email}`,
            }),
          });
        }
      }

      for (const persona of blueprint.keyPersonas) {
        requireId({
          ids: userIdByEmail,
          key: persona.email,
          description: `key persona ${persona.email}`,
        });
      }

      const seededGatherings = await loadGatherings({
        db,
        churchId: church.id,
        blueprint: blueprint.gatherings,
        ministries: primary.ministries,
      });
      const historicalCycle = await loadDevelopmentHistory({
        db,
        churchId: church.id,
        timeZone: blueprint.primary.church.timezone,
        anchor,
        directory: blueprint.primary,
        gatherings: blueprint.gatherings,
        seededGatherings,
        history: blueprint.history,
        ministries: primary.ministries,
        volunteerIdByEmail: primary.volunteerIdByEmail,
        userIdByEmail,
      });

      return {
        anchor,
        church,
        secondChurch,
        keyPersonas: blueprint.keyPersonas,
        historicalCycle,
      };
    },
  };
}

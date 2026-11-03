import { buildChurch, buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import { buildMinistry, buildRole } from '@/seeds/builders/ministry';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '@/seeds/builders/volunteer';
import type { schedulingTestDb } from '@/tests/scheduling-reshape/setup';

export const MANAGEMENT_CHURCH_A = 'a1111111-1111-4111-8111-111111111111';
export const MANAGEMENT_CHURCH_B = 'a2222222-2222-4222-8222-222222222222';

/**
 * The eight people the invitation-management suites act as: admins with and
 * without leadership, leaders of different Ministries, a plain Volunteer,
 * Members with no Volunteer profile, and an admin of another Church.
 */
export type ManagementPersona =
  | 'admin'
  | 'adminLeader'
  | 'worshipLeader'
  | 'kidsLeader'
  | 'worshipVolunteer'
  | 'memberNoVolunteer'
  | 'invitee'
  | 'foreignUser';

export interface InvitationManagementGraph {
  userIds: Record<ManagementPersona, string>;
  volunteerIds: Partial<Record<ManagementPersona, string>>;
  worshipId: string;
  kidsId: string;
  foreignMinistryId: string;
  singerId: string;
  helperId: string;
}

export interface SeedInvitationManagementGraphInput {
  db: typeof schedulingTestDb;
  /** Keeps ids, emails and slugs distinct per suite, e.g. `resend`. */
  prefix: string;
}

interface PersonaInput {
  key: ManagementPersona;
  churchAccess: 'admin' | 'member';
  leads?: string[];
  serves?: string[];
  churchId?: string;
}

/**
 * Church A (Worship with Singer, Kids with Helper) and Church B (Foreign),
 * with every persona's Church Membership and Ministry Memberships.
 */
export async function seedInvitationManagementGraph({
  db,
  prefix,
}: SeedInvitationManagementGraphInput): Promise<InvitationManagementGraph> {
  async function persona({
    key,
    churchAccess,
    leads = [],
    serves = [],
    churchId = MANAGEMENT_CHURCH_A,
  }: PersonaInput) {
    const userId = `${prefix}-${key}`;
    await buildUser({
      db,
      id: userId,
      name: key,
      email: `${key}@${prefix}.test`,
    });
    await buildChurchMembership({
      db,
      churchId,
      userId,
      accessLevel: churchAccess,
    });
    if (leads.length + serves.length === 0) return { userId };
    const volunteer = await buildVolunteer({ db, churchId, userId });
    const memberships = [
      ...leads.map((ministryId) => ({ ministryId, level: 'leader' as const })),
      ...serves.map((ministryId) => ({
        ministryId,
        level: 'volunteer' as const,
      })),
    ];
    for (const { ministryId, level } of memberships) {
      await buildMinistryMembership({
        db,
        churchId,
        volunteerId: volunteer.id,
        ministryId,
        ministryAccessLevel: level,
        roleIds: [],
      });
    }
    return { userId, volunteerId: volunteer.id };
  }

  await buildChurch({
    db,
    id: MANAGEMENT_CHURCH_A,
    name: 'A',
    slug: `${prefix}-a`,
    timezone: 'America/Sao_Paulo',
  });
  await buildChurch({
    db,
    id: MANAGEMENT_CHURCH_B,
    name: 'B',
    slug: `${prefix}-b`,
    timezone: 'UTC',
  });
  const worship = await buildMinistry({
    db,
    churchId: MANAGEMENT_CHURCH_A,
    name: 'Worship',
  });
  const kids = await buildMinistry({
    db,
    churchId: MANAGEMENT_CHURCH_A,
    name: 'Kids',
  });
  const foreign = await buildMinistry({
    db,
    churchId: MANAGEMENT_CHURCH_B,
    name: 'Foreign',
  });
  const singer = await buildRole({
    db,
    churchId: MANAGEMENT_CHURCH_A,
    ministryId: worship.id,
    name: 'Singer',
  });
  const helper = await buildRole({
    db,
    churchId: MANAGEMENT_CHURCH_A,
    ministryId: kids.id,
    name: 'Helper',
  });
  const people = {
    admin: await persona({ key: 'admin', churchAccess: 'admin' }),
    adminLeader: await persona({
      key: 'adminLeader',
      churchAccess: 'admin',
      leads: [worship.id],
    }),
    worshipLeader: await persona({
      key: 'worshipLeader',
      churchAccess: 'member',
      leads: [worship.id],
    }),
    kidsLeader: await persona({
      key: 'kidsLeader',
      churchAccess: 'member',
      leads: [kids.id],
    }),
    worshipVolunteer: await persona({
      key: 'worshipVolunteer',
      churchAccess: 'member',
      serves: [worship.id],
    }),
    memberNoVolunteer: await persona({
      key: 'memberNoVolunteer',
      churchAccess: 'member',
    }),
    invitee: await persona({ key: 'invitee', churchAccess: 'member' }),
    foreignUser: await persona({
      key: 'foreignUser',
      churchAccess: 'admin',
      churchId: MANAGEMENT_CHURCH_B,
    }),
  };
  return {
    userIds: Object.fromEntries(
      Object.entries(people).map(([key, value]) => [key, value.userId]),
    ) as Record<ManagementPersona, string>,
    volunteerIds: Object.fromEntries(
      Object.entries(people).map(([key, value]) => [
        key,
        'volunteerId' in value ? value.volunteerId : undefined,
      ]),
    ),
    worshipId: worship.id,
    kidsId: kids.id,
    foreignMinistryId: foreign.id,
    singerId: singer.id,
    helperId: helper.id,
  };
}

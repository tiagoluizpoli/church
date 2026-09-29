import {
  account,
  type ChurchAccessLevel,
  church,
  member,
  ministryVolunteer,
  organization,
  user,
  volunteer,
} from '@church/db';
import { and, eq, isNotNull } from 'drizzle-orm';
import { DEVELOPMENT_CHURCH_TIMEZONE } from '../blueprints/development';
import type { SeedWriter } from '../recipe';
import type { DevelopmentRecipeResult } from '../recipes/development';
import type { SeededPersona } from '../recipes/minimal-church';

export interface VerifyDevelopmentGraphInput {
  db: SeedWriter;
  seeded: DevelopmentRecipeResult;
}

interface PersonaCheckInput {
  db: SeedWriter;
  persona: SeededPersona;
  churchId: string;
  accessLevel: ChurchAccessLevel;
}

/** A persona can sign in and holds its Church Membership. */
async function personaProblems({
  db,
  persona,
  churchId,
  accessLevel,
}: PersonaCheckInput): Promise<string[]> {
  const problems: string[] = [];
  const [userRow] = await db
    .select({ emailVerified: user.emailVerified })
    .from(user)
    .where(and(eq(user.id, persona.userId), eq(user.email, persona.email)));
  if (!userRow?.emailVerified) {
    problems.push(`${persona.email} has no verified User`);
  }

  const credentials = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, persona.userId),
        eq(account.providerId, 'credential'),
        isNotNull(account.password),
      ),
    );
  if (credentials.length !== 1) {
    problems.push(`${persona.email} has no single credential account`);
  }

  const [membership] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.organizationId, churchId),
        eq(member.userId, persona.userId),
      ),
    );
  if (membership?.role !== accessLevel) {
    problems.push(`${persona.email} is not a Church ${accessLevel}`);
  }

  return problems;
}

/**
 * Reads the committed graph back and refuses it when a critical invariant is
 * missing, so the command never reports success for a graph a developer
 * cannot sign in to.
 */
export async function verifyDevelopmentGraph({
  db,
  seeded,
}: VerifyDevelopmentGraphInput): Promise<void> {
  const problems: string[] = [];

  const [churchRow] = await db
    .select({ timezone: church.timezone })
    .from(organization)
    .innerJoin(church, eq(church.id, organization.id))
    .where(eq(organization.id, seeded.church.id));
  if (churchRow?.timezone !== DEVELOPMENT_CHURCH_TIMEZONE) {
    problems.push(
      `Church ${seeded.church.slug} is missing or not in ${DEVELOPMENT_CHURCH_TIMEZONE}`,
    );
  }

  problems.push(
    ...(await personaProblems({
      db,
      persona: seeded.personas.churchAdmin,
      churchId: seeded.church.id,
      accessLevel: 'admin',
    })),
    ...(await personaProblems({
      db,
      persona: seeded.personas.volunteer,
      churchId: seeded.church.id,
      accessLevel: 'member',
    })),
  );

  const [activeMembership] = await db
    .select({ id: ministryVolunteer.id })
    .from(ministryVolunteer)
    .innerJoin(volunteer, eq(volunteer.id, ministryVolunteer.volunteerId))
    .where(
      and(
        eq(
          ministryVolunteer.id,
          seeded.personas.volunteer.ministryMembershipId,
        ),
        eq(ministryVolunteer.ministryId, seeded.ministry.id),
        eq(ministryVolunteer.status, 'active'),
        eq(volunteer.status, 'active'),
      ),
    );
  if (!activeMembership) {
    problems.push(
      `${seeded.personas.volunteer.email} has no active Ministry Membership`,
    );
  }

  if (problems.length > 0) {
    throw new Error(`Seeded graph is incomplete: ${problems.join('; ')}.`);
  }
}

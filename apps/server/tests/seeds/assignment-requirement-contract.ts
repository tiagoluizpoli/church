import { assignment, shift, shiftRequirement } from '@church/db';
import { eq, isNull, ne, or } from 'drizzle-orm';
import { expect } from 'vitest';
import { testDb } from '@/tests/integration/repositories/setup';

/** Includes declined/cancelled history: every seeded Assignment keeps its place. */
export async function expectAssignmentRequirementsToAgree(): Promise<void> {
  const mismatches = await testDb
    .select({ id: assignment.id })
    .from(assignment)
    .leftJoin(
      shiftRequirement,
      eq(shiftRequirement.id, assignment.shiftRequirementId),
    )
    .leftJoin(shift, eq(shift.id, assignment.shiftId))
    .where(
      or(
        isNull(shiftRequirement.id),
        isNull(shift.id),
        ne(assignment.churchId, shiftRequirement.churchId),
        ne(assignment.participationId, shiftRequirement.participationId),
        ne(assignment.shiftId, shiftRequirement.shiftId),
        ne(assignment.roleId, shiftRequirement.roleId),
        ne(shift.churchId, assignment.churchId),
        ne(shift.participationId, assignment.participationId),
      ),
    );
  expect(mismatches).toEqual([]);
}

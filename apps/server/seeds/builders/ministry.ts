import { ministry, role, team } from '@church/db';
import type { SeedWriter } from '../recipe';
import { requireInsertedRow } from './require-inserted-row';

export type SeededMinistry = typeof ministry.$inferSelect;
export type SeededTeam = typeof team.$inferSelect;
export type SeededRole = typeof role.$inferSelect;

export interface BuildMinistryInput {
  db: SeedWriter;
  churchId: string;
  id?: string;
  name: string;
  /** Left to the column default when a fixture does not care. */
  enforcementType?: SeededMinistry['enforcementType'];
  defaultDirection?: SeededMinistry['defaultDirection'];
}

export async function buildMinistry({
  db,
  churchId,
  id,
  name,
  enforcementType,
  defaultDirection,
}: BuildMinistryInput): Promise<SeededMinistry> {
  return requireInsertedRow({
    rows: await db
      .insert(ministry)
      .values({ id, churchId, name, enforcementType, defaultDirection })
      .returning(),
    description: `Ministry ${name}`,
  });
}

export interface BuildMinistryChildInput {
  db: SeedWriter;
  churchId: string;
  ministryId: string;
  id?: string;
  name: string;
}

export async function buildTeam({
  db,
  churchId,
  ministryId,
  id,
  name,
}: BuildMinistryChildInput): Promise<SeededTeam> {
  return requireInsertedRow({
    rows: await db
      .insert(team)
      .values({ id, churchId, ministryId, name })
      .returning(),
    description: `Team ${name}`,
  });
}

export async function buildRole({
  db,
  churchId,
  ministryId,
  id,
  name,
}: BuildMinistryChildInput): Promise<SeededRole> {
  return requireInsertedRow({
    rows: await db
      .insert(role)
      .values({ id, churchId, ministryId, name })
      .returning(),
    description: `Role ${name}`,
  });
}

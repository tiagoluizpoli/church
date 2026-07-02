import type { team } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type { ChurchId, MinistryId, TeamId } from '../../domain/branded-ids';
import type { TeamProps } from '../../domain/entities/team';
import { Team } from '../../domain/entities/team';

type TeamRow = InferSelectModel<typeof team>;

export function mapTeam(row: TeamRow): Team {
  const props: TeamProps = {
    churchId: row.churchId as ChurchId,
    ministryId: row.ministryId as MinistryId,
    name: row.name,
  };

  return new Team(props, row.id as TeamId);
}

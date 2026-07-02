import type { ChurchId, MinistryId, TeamId } from '../../domain/branded-ids';
import type { TeamProps } from '../../domain/entities/team';
import { Team } from '../../domain/entities/team';

export function mapTeam(row: {
  id: string;
  churchId: string;
  ministryId: string;
  name: string;
}): Team {
  const props: TeamProps = {
    churchId: row.churchId as ChurchId,
    ministryId: row.ministryId as MinistryId,
    name: row.name,
  };

  return new Team(props, row.id as TeamId);
}

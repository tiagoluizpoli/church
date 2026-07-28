export type MinistryAccessLevel = 'leader' | 'volunteer';

export type AssigneeRoleLabel = 'Leader' | 'Team Leader';

/**
 * What `formatAssigneeRoleLabel` needs to know about one volunteer's
 * standing. Mirrors the two independent facts the API now returns
 * (`ScheduleBuilderVolunteerOption`): a ministry-wide access level, and the
 * specific teams — if any — this member leads. A volunteer can be a plain
 * ministry `volunteer` while leading Team A, or a ministry `leader` who leads
 * no specific team row.
 */
export interface AssigneeMembership {
  ministryAccessLevel: MinistryAccessLevel;
  /** Teams (by id) this member leads. Empty when they lead none. */
  leadTeamIds: string[];
}

export interface FormatAssigneeRoleLabelInput {
  membership: AssigneeMembership | undefined;
  /**
   * The team this badge is being rendered in the context of — e.g. the team a
   * shift's requirement is scoped to. `undefined` when the surrounding UI has
   * no team of its own (a ministry-wide list): in that case a Team Leader
   * badge would misrepresent leadership of a team unrelated to what's on
   * screen, so only the ministry-wide Leader badge can ever show.
   */
  contextTeamId?: string;
}

/**
 * Maps a volunteer's ministry access level and (team-scoped) team leadership
 * to the badge label shown next to their name. Ministry-wide `leader` always
 * wins and needs no team context. Team leadership only earns a badge when
 * `contextTeamId` names a team this volunteer actually leads — the same
 * volunteer reads as a plain member in any other team's context, or when no
 * team context is known at all (FR-013).
 */
export function formatAssigneeRoleLabel({
  membership,
  contextTeamId,
}: FormatAssigneeRoleLabelInput): AssigneeRoleLabel | undefined {
  if (!membership) return undefined;
  if (membership.ministryAccessLevel === 'leader') return 'Leader';
  if (contextTeamId && membership.leadTeamIds.includes(contextTeamId)) {
    return 'Team Leader';
  }
  return undefined;
}

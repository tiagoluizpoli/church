/** A fixed fake person. The email is the sign-in identity and must end in `.test`. */
export interface Person {
  name: string;
  email: string;
}

export interface TeamSeat<TTeam extends string> {
  team: TTeam;
  /** TeamLeader: leadership scoped to this Team only. */
  teamLeader?: true;
}

/** Where a person sits in one Ministry. */
export interface MinistrySeat<TRole extends string, TTeam extends string> {
  /** Ministry leader: authority over the whole Ministry. */
  ministryLeader?: true;
  /** Role qualifications — membership alone qualifies for nothing. */
  roles: readonly TRole[];
  teams?: readonly TeamSeat<TTeam>[];
}

/** People who share one seat, declared once so a roster reads as a list of names. */
export interface RosterGroup<TRole extends string, TTeam extends string> {
  seat: MinistrySeat<TRole, TTeam>;
  people: readonly Person[];
}

export interface MinistryBlueprint<
  TRole extends string = string,
  TTeam extends string = string,
> {
  name: string;
  roles: readonly TRole[];
  teams: readonly TTeam[];
  /** The people whose first Ministry this is; each person is declared once. */
  roster: readonly RosterGroup<TRole, TTeam>[];
}

/** A Ministry's structure and roster, type-checked against its own Roles and Teams. */
export function defineMinistry<
  const TRole extends string,
  const TTeam extends string = never,
>(ministry: MinistryBlueprint<TRole, TTeam>): MinistryBlueprint<TRole, TTeam> {
  return ministry;
}

/** People declared in another roster who also serve in `ministry`. */
export interface CrossMinistryGroup<
  TRole extends string = string,
  TTeam extends string = string,
> {
  ministry: MinistryBlueprint<TRole, TTeam>;
  seat: MinistrySeat<TRole, TTeam>;
  emails: readonly string[];
}

export function joinMinistry<TRole extends string, TTeam extends string>(
  group: CrossMinistryGroup<TRole, TTeam>,
): CrossMinistryGroup {
  return group;
}

export interface ChurchIdentity {
  name: string;
  slug: string;
  timezone: string;
}

/** One Church's complete directory: its ChurchAdmin, Ministries and cross-Ministry service. */
export interface ChurchDirectoryBlueprint {
  church: ChurchIdentity;
  churchAdmin: Person;
  ministries: readonly MinistryBlueprint[];
  crossMinistry: readonly CrossMinistryGroup[];
}

/**
 * People who hold a plain Church Membership in `churchSlug` while serving as a
 * Volunteer (or ChurchAdmin) in the Church their roster belongs to.
 */
export interface MultiChurchMembershipGroup {
  churchSlug: string;
  emails: readonly string[];
}

/** A persona `db:reseed:dev` prints as a ready sign-in. */
export interface KeyPersona {
  label: string;
  email: string;
}

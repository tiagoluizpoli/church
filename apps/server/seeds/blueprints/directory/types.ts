/** A fixed fake person. The email is the sign-in identity and must end in `.test`. */
export interface Person {
  name: string;
  email: string;
}

/** Where a person sits in one Ministry. */
export interface MinistrySeat<TRole extends string> {
  /** Ministry leader: authority over the whole Ministry. */
  ministryLeader?: true;
  /** Role qualifications — membership alone qualifies for nothing. */
  roles: readonly TRole[];
}

/** People who share one seat, declared once so a schedule reads as a list of names. */
export interface ScheduleGroup<TRole extends string> {
  seat: MinistrySeat<TRole>;
  people: readonly Person[];
}

export interface MinistryBlueprint<
  TRole extends string = string,
  TSector extends string = string,
> {
  name: string;
  roles: readonly TRole[];
  /** Named spots or duties of the Ministry (ADR-0007); eligibility spans all of them. */
  sectors: readonly TSector[];
  /** The people whose first Ministry this is; each person is declared once. */
  schedule: readonly ScheduleGroup<TRole>[];
}

/** A Ministry's structure and schedule, type-checked against its own Roles and Sectors. */
export function defineMinistry<
  const TRole extends string,
  const TSector extends string = never,
>(
  ministry: MinistryBlueprint<TRole, TSector>,
): MinistryBlueprint<TRole, TSector> {
  return ministry;
}

/** People declared in another schedule who also serve in `ministry`. */
export interface CrossMinistryGroup<
  TRole extends string = string,
  TSector extends string = string,
> {
  ministry: MinistryBlueprint<TRole, TSector>;
  seat: MinistrySeat<TRole>;
  emails: readonly string[];
}

export function joinMinistry<TRole extends string, TSector extends string>(
  group: CrossMinistryGroup<TRole, TSector>,
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
 * Volunteer (or ChurchAdmin) in the Church their schedule belongs to.
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

import { NotFoundError } from '@church/core';
import type {
  AssertMinistryHeadcountsInput,
  CandidateFacts,
  DbParticipationReaderDependencies,
  GetOrCreateParticipationInput,
  IParticipationReader,
  ListVolunteerMembershipInfoInput,
  LoadCandidateFactsInput,
  LoadCheckStatesInput,
  VolunteerMembershipInfo,
} from '../domain/contracts/application/participation-reader';
import type { AssignmentRepository } from '../domain/contracts/infrastructure/assignment.repository';
import type { AvailabilityCheckRepository } from '../domain/contracts/infrastructure/availability-check.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { SectorRepository } from '../domain/contracts/infrastructure/sector.repository';
import type { ShiftRepository } from '../domain/contracts/infrastructure/shift.repository';
import type { UnavailableShiftRepository } from '../domain/contracts/infrastructure/unavailable-shift.repository';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
import { isActiveAssignmentStatus } from '../domain/entities/assignment';
import type { MinistryParticipation } from '../domain/entities/ministry-participation';
import type { Shift } from '../domain/entities/shift';

export class DbParticipationReader implements IParticipationReader {
  private readonly assignmentRepository: AssignmentRepository;
  private readonly availabilityCheckRepository: AvailabilityCheckRepository;
  private readonly ministryRepository: MinistryRepository;
  private readonly participationRepository: MinistryParticipationRepository;
  private readonly roleRepository: RoleRepository;
  private readonly sectorRepository: SectorRepository;
  private readonly shiftRepository: ShiftRepository;
  private readonly unavailableShiftRepository: UnavailableShiftRepository;
  private readonly volunteerRepository: VolunteerRepository;

  constructor({
    assignmentRepository,
    availabilityCheckRepository,
    ministryRepository,
    participationRepository,
    roleRepository,
    sectorRepository,
    shiftRepository,
    unavailableShiftRepository,
    volunteerRepository,
  }: DbParticipationReaderDependencies) {
    this.assignmentRepository = assignmentRepository;
    this.availabilityCheckRepository = availabilityCheckRepository;
    this.ministryRepository = ministryRepository;
    this.participationRepository = participationRepository;
    this.roleRepository = roleRepository;
    this.sectorRepository = sectorRepository;
    this.shiftRepository = shiftRepository;
    this.unavailableShiftRepository = unavailableShiftRepository;
    this.volunteerRepository = volunteerRepository;
  }

  /**
   * A Sector or Role outside the Ministry (or Church) is not found (#385),
   * and so is an archived Role. The active Roles stay share-locked until `tx`
   * ends, so a concurrent Role archive sees this write or this write sees it.
   */
  async assertMinistryHeadcounts({
    churchId,
    ministryId,
    headcounts,
    tx,
  }: AssertMinistryHeadcountsInput): Promise<void> {
    if (headcounts.length === 0) return;
    // Locked, not just read: an archived Sector or Role is not found for new
    // use, and a concurrent archive cannot slip between this check and the write.
    const [sectorIds, roles] = await Promise.all([
      this.sectorRepository.lockActive({
        churchId,
        ministryId,
        sectorIds: headcounts.map(({ sectorId }) => sectorId),
        tx,
      }),
      this.roleRepository.lockActiveForUse({
        churchId,
        ministryId,
        roleIds: headcounts.map(({ roleId }) => roleId),
        tx,
      }),
    ]);
    const roleIds = new Set<string>(roles.map((role) => role.id));
    for (const { sectorId, roleId } of headcounts) {
      if (!sectorIds.has(sectorId)) {
        throw new NotFoundError(`Sector not found: ${sectorId}`);
      }
      if (!roleIds.has(roleId)) {
        throw new NotFoundError(`Role not found: ${roleId}`);
      }
    }
  }

  async getOrCreateParticipation(
    input: GetOrCreateParticipationInput,
  ): Promise<MinistryParticipation> {
    const existing = await this.participationRepository.findByMinistryEvent({
      churchId: input.churchId,
      ministryId: input.ministryId,
      eventId: input.eventId,
      tx: input.tx,
    });

    if (existing) {
      return existing;
    }

    // A new participation is new use: refused for an archived Ministry.
    await this.ministryRepository.lockActive({
      churchId: input.churchId,
      ministryId: input.ministryId,
      strength: 'share',
      tx: input.tx,
    });
    return this.participationRepository.create({
      churchId: input.churchId,
      ministryId: input.ministryId,
      eventId: input.eventId,
      tx: input.tx,
    });
  }

  /**
   * Membership facts per volunteer for one ministry, keyed by volunteer id:
   * qualified role ids and ministry-wide access level. Reads the
   * membership rows directly rather than inverting the per-role candidate
   * lists, so a volunteer's full skill set survives even when the cycle
   * happens to require only some of their roles.
   */
  async listVolunteerMembershipInfo({
    churchId,
    ministryId,
    tx,
  }: ListVolunteerMembershipInfoInput): Promise<
    Map<string, VolunteerMembershipInfo>
  > {
    const memberships = await this.volunteerRepository.listMinistryMemberships({
      churchId,
      ministryId,
      tx,
    });
    return new Map(
      memberships.map((membership) => [
        membership.volunteerId as string,
        {
          qualifiedRoleIds: membership.qualifiedRoleIds,
          ministryAccessLevel: membership.ministryAccessLevel,
        },
      ]),
    );
  }

  async loadCheckStates({
    churchId,
    ministryId,
    cycleId,
    tx,
  }: LoadCheckStatesInput) {
    const memberships =
      await this.availabilityCheckRepository.listActiveMemberships({
        churchId,
        ministryId,
        tx,
      });
    if (memberships.length === 0)
      return new Map<string, 'pending' | 'confirmed'>();
    const checks = await this.availabilityCheckRepository.listByCycle({
      churchId,
      cycleId,
      ministryMembershipIds: memberships.map((m) => m.ministryMembershipId),
      tx,
    });
    const volunteers = new Map(
      memberships.map((m) => [m.ministryMembershipId, m.volunteerId as string]),
    );
    const result = new Map<string, 'pending' | 'confirmed'>();
    for (const check of checks) {
      const volunteerId = volunteers.get(check.ministryMembershipId);
      if (volunteerId) result.set(volunteerId, check.state);
    }
    return result;
  }

  async loadCandidateFacts({
    churchId,
    volunteerIds,
    tx,
  }: LoadCandidateFactsInput): Promise<CandidateFacts> {
    const [unavailableShifts, assignments] = await Promise.all([
      this.unavailableShiftRepository.listByVolunteers({
        churchId,
        volunteerIds,
        tx,
      }),
      this.assignmentRepository.listByVolunteers({
        churchId,
        volunteerIds,
        tx,
      }),
    ]);
    const activeAssignments = assignments.filter((assignment) =>
      isActiveAssignmentStatus(assignment.status),
    );
    const shiftIds = [
      ...new Set(
        activeAssignments
          .map((assignment) => assignment.shiftId)
          .filter((id): id is Shift['id'] => id != null),
      ),
    ];
    const facts = await this.shiftRepository.listConflictFacts({
      churchId,
      shiftIds,
      tx,
    });
    const assignmentShiftsById = new Map(
      facts.map(({ shift }) => [shift.id as string, shift]),
    );
    const conflictDetails: CandidateFacts['conflictDetails'] = new Map(
      facts.map(({ shift, ministryName, eventTitle }) => [
        shift.id as string,
        {
          ministryName,
          eventTitle,
          startTime: shift.startTime,
          endTime: shift.endTime,
        },
      ]),
    );
    const unavailableShiftKeys = new Set(
      unavailableShifts.map(
        (mark) => `${mark.volunteerId as string}:${mark.shiftId as string}`,
      ),
    );
    return {
      activeAssignments,
      assignmentShiftsById,
      conflictDetails,
      unavailableShiftKeys,
    };
  }
}

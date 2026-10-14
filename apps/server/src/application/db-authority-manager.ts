import { AuthorityService } from '../domain/authority/authority-service';
import type { ChurchId, UserId } from '../domain/branded-ids';
import type {
  CanManageChurchInput,
  CanManageEventInput,
  CanManageEventSlotInput,
  CanManageMinistryInput,
  CanManageParticipationInput,
  CanManageShiftInput,
  CanManageTeamInput,
  CanManageTeamShiftInput,
  HasSchedulingAccessInput,
  IAuthorityManager,
  SchedulingCapabilityProjection,
} from '../domain/contracts/application/authority-manager';
import type { AuthorityActorRepository } from '../domain/contracts/infrastructure/authority-actor.repository';
import type { EventRepository } from '../domain/contracts/infrastructure/event.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { SchedulingScopeRepository } from '../domain/contracts/infrastructure/scheduling-scope.repository';
import type { TeamRepository } from '../domain/contracts/infrastructure/team.repository';
import type { TimeSlotRepository } from '../domain/contracts/infrastructure/time-slot.repository';

interface ResolveActorInput {
  churchId: ChurchId;
  userId: UserId;
}

interface DbAuthorityManagerDependencies {
  actorRepository: AuthorityActorRepository;
  scopeRepository: SchedulingScopeRepository;
  eventRepository: EventRepository;
  timeSlotRepository: TimeSlotRepository;
  ministryRepository: MinistryRepository;
  teamRepository?: TeamRepository;
}

export class DbAuthorityManager implements IAuthorityManager {
  private readonly actorRepository: AuthorityActorRepository;
  private readonly scopeRepository: SchedulingScopeRepository;
  private readonly eventRepository: EventRepository;
  private readonly timeSlotRepository: TimeSlotRepository;
  private readonly ministryRepository: MinistryRepository;
  private readonly teamRepository?: TeamRepository;

  constructor({
    actorRepository,
    scopeRepository,
    eventRepository,
    timeSlotRepository,
    ministryRepository,
    teamRepository,
  }: DbAuthorityManagerDependencies) {
    this.actorRepository = actorRepository;
    this.scopeRepository = scopeRepository;
    this.eventRepository = eventRepository;
    this.timeSlotRepository = timeSlotRepository;
    this.ministryRepository = ministryRepository;
    this.teamRepository = teamRepository;
  }

  async canManageChurch(input: CanManageChurchInput): Promise<boolean> {
    const actor = await this.resolveActor(input);
    return AuthorityService.authorize({
      actor,
      action: 'manage',
      resource: { type: 'church', churchId: input.churchId },
    }).allowed;
  }

  async canManageMinistry(input: CanManageMinistryInput): Promise<boolean> {
    const actor = await this.resolveActor(input);
    return AuthorityService.authorize({
      actor,
      action: 'manage',
      resource: {
        type: 'ministry',
        churchId: input.churchId,
        ministryId: input.ministryId,
      },
    }).allowed;
  }

  async canManageTeam(input: CanManageTeamInput): Promise<boolean> {
    const actor = await this.resolveActor(input);
    return AuthorityService.authorize({
      actor,
      action: 'manage',
      resource: {
        type: 'team',
        churchId: input.churchId,
        ministryId: input.ministryId,
        teamId: input.teamId,
      },
    }).allowed;
  }

  async canManageTeamShift(input: CanManageTeamShiftInput): Promise<boolean> {
    const ministryId = await this.scopeRepository.resolveShiftMinistry({
      churchId: input.churchId,
      shiftId: input.shiftId,
    });
    if (!ministryId || !this.teamRepository) return false;

    const [team] = await this.teamRepository.listByIds(input.churchId, [
      input.teamId,
    ]);
    if (!team || team.ministryId !== ministryId) return false;

    return this.canManageTeam({ ...input, ministryId });
  }

  async canManageParticipation(
    input: CanManageParticipationInput,
  ): Promise<boolean> {
    const ministryId = await this.scopeRepository.resolveParticipationMinistry({
      churchId: input.churchId,
      participationId: input.participationId,
    });
    if (!ministryId) return false;
    return this.canManageMinistry({ ...input, ministryId });
  }

  async canManageShift(input: CanManageShiftInput): Promise<boolean> {
    const ministryId = await this.scopeRepository.resolveShiftMinistry({
      churchId: input.churchId,
      shiftId: input.shiftId,
    });
    if (!ministryId) return false;
    return this.canManageMinistry({ ...input, ministryId });
  }

  async canManageEvent(input: CanManageEventInput): Promise<boolean> {
    const ministryId = await this.eventRepository.getMinistryId(
      input.churchId,
      input.eventId,
    );
    return this.canManageMinistry({ ...input, ministryId });
  }

  async canManageEventSlot(input: CanManageEventSlotInput): Promise<boolean> {
    const slot = await this.timeSlotRepository.getById(
      input.churchId,
      input.slotId,
    );
    return this.canManageEvent({ ...input, eventId: slot.eventId });
  }

  async resolveSchedulingCapability(
    input: HasSchedulingAccessInput,
  ): Promise<SchedulingCapabilityProjection> {
    const actor = await this.resolveActor(input);
    const churchDecision = AuthorityService.authorize({
      actor,
      action: 'manage',
      resource: { type: 'church', churchId: input.churchId },
    });
    if (churchDecision.allowed) {
      return { canAccessScheduling: true, entries: [{ kind: 'church' }] };
    }

    const ledMinistryIds = actor.ministryMemberships.flatMap((membership) => {
      const decision = AuthorityService.authorize({
        actor,
        action: 'manage',
        resource: {
          type: 'ministry',
          churchId: input.churchId,
          ministryId: membership.ministryId,
        },
      });
      return decision.allowed ? [membership.ministryId] : [];
    });
    const ministryEntries = await Promise.all(
      ledMinistryIds.map(async (ministryId) => {
        const ministry = await this.ministryRepository.getById(
          input.churchId,
          ministryId,
        );
        return { kind: 'ministry' as const, ministryId, name: ministry.name };
      }),
    );
    const ledTeamMemberships = actor.teamMemberships.filter(
      (membership) =>
        AuthorityService.authorize({
          actor,
          action: 'manage',
          resource: {
            type: 'team',
            churchId: input.churchId,
            ministryId: membership.ministryId,
            teamId: membership.teamId,
          },
        }).allowed,
    );
    const teams =
      ledTeamMemberships.length === 0
        ? []
        : ((await this.teamRepository?.listByIds(
            input.churchId,
            ledTeamMemberships.map((membership) => membership.teamId),
          )) ?? []);
    const ministries = await Promise.all(
      [
        ...new Set(
          ledTeamMemberships.map((membership) => membership.ministryId),
        ),
      ].map((ministryId) =>
        this.ministryRepository.getById(input.churchId, ministryId),
      ),
    );
    const ministryNames = new Map(
      ministries.map((ministry) => [ministry.id, ministry.name]),
    );
    const teamEntries = teams.flatMap((team) => {
      if (ledMinistryIds.includes(team.ministryId)) return [];
      const ministryName = ministryNames.get(team.ministryId);
      return ministryName
        ? [
            {
              kind: 'team' as const,
              ministryId: team.ministryId,
              ministryName,
              teamId: team.id,
              name: team.name,
            },
          ]
        : [];
    });
    const entries = [...ministryEntries, ...teamEntries];
    return { canAccessScheduling: entries.length > 0, entries };
  }

  async hasSchedulingAccess(input: HasSchedulingAccessInput): Promise<boolean> {
    const capability = await this.resolveSchedulingCapability(input);
    return capability.canAccessScheduling;
  }

  private async resolveActor(input: ResolveActorInput) {
    return this.actorRepository.resolveActor({
      userId: input.userId,
      activeChurchId: input.churchId,
    });
  }
}

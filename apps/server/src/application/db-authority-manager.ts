import { AuthorityService } from '../domain/authority/authority-service';
import type { AuthorityDecision } from '../domain/authority/types';
import type { ChurchId, UserId } from '../domain/branded-ids';
import type {
  CanManageChurchInput,
  CanManageEventInput,
  CanManageEventTimeBlockInput,
  CanManageMinistryInput,
  CanManageParticipationInput,
  CanManageShiftInput,
  DecideAuthorityInput,
  HasSchedulingAccessInput,
  IAuthorityManager,
  SchedulingCapabilityProjection,
} from '../domain/contracts/application/authority-manager';
import type { AuthorityActorRepository } from '../domain/contracts/infrastructure/authority-actor.repository';
import type { EventRepository } from '../domain/contracts/infrastructure/event.repository';
import type { EventTimeBlockRepository } from '../domain/contracts/infrastructure/event-time-block.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { SchedulingScopeRepository } from '../domain/contracts/infrastructure/scheduling-scope.repository';

interface ResolveActorInput {
  churchId: ChurchId;
  userId: UserId;
}

interface DbAuthorityManagerDependencies {
  actorRepository: AuthorityActorRepository;
  scopeRepository: SchedulingScopeRepository;
  eventRepository: EventRepository;
  eventTimeBlockRepository: EventTimeBlockRepository;
  ministryRepository: MinistryRepository;
}

export class DbAuthorityManager implements IAuthorityManager {
  private readonly actorRepository: AuthorityActorRepository;
  private readonly scopeRepository: SchedulingScopeRepository;
  private readonly eventRepository: EventRepository;
  private readonly eventTimeBlockRepository: EventTimeBlockRepository;
  private readonly ministryRepository: MinistryRepository;

  constructor({
    actorRepository,
    scopeRepository,
    eventRepository,
    eventTimeBlockRepository,
    ministryRepository,
  }: DbAuthorityManagerDependencies) {
    this.actorRepository = actorRepository;
    this.scopeRepository = scopeRepository;
    this.eventRepository = eventRepository;
    this.eventTimeBlockRepository = eventTimeBlockRepository;
    this.ministryRepository = ministryRepository;
  }

  async decideAuthority(
    input: DecideAuthorityInput,
  ): Promise<AuthorityDecision> {
    const { resource, action, scope } = input;
    if (!resource) return { allowed: false, reason: 'RESOURCE_NOT_FOUND' };
    const actor = await this.resolveActor(input);
    return AuthorityService.authorize({ actor, action, resource, scope });
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

  async canManageEventTimeBlock(
    input: CanManageEventTimeBlockInput,
  ): Promise<boolean> {
    const eventTimeBlock = await this.eventTimeBlockRepository.getById(
      input.churchId,
      input.eventTimeBlockId,
    );
    return this.canManageEvent({ ...input, eventId: eventTimeBlock.eventId });
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
    const entries = ministryEntries;
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

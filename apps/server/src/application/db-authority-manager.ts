import { NotFoundError } from '@church/core';
import { AuthorityService } from '../domain/authority/authority-service';
import type { AuthorityDecision } from '../domain/authority/types';
import type { ChurchId, UserId } from '../domain/branded-ids';
import type {
  CallerCapabilitiesProjection,
  CanManageChurchInput,
  CanManageEventInput,
  CanManageEventTimeBlockInput,
  CanManageMinistryInput,
  CanManageParticipationInput,
  CanManageShiftInput,
  DecideAuthorityInput,
  HasSchedulingAccessInput,
  IAuthorityManager,
  ResolveCallerCapabilitiesInput,
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

  async decideManageAnyMinistry(
    input: CanManageChurchInput,
  ): Promise<AuthorityDecision> {
    const { churchId } = input;
    const actor = await this.resolveActor(input);
    const churchDecision = AuthorityService.authorize({
      actor,
      action: 'manage',
      resource: { type: 'church', churchId },
      scope: 'function',
    });
    if (churchDecision.allowed) return churchDecision;
    if (
      !actor.churchMembership ||
      actor.churchMembership.churchId !== churchId
    ) {
      return churchDecision;
    }

    for (const membership of actor.ministryMemberships) {
      if (membership.churchId !== churchId) continue;
      const ministryDecision = AuthorityService.authorize({
        actor,
        action: 'manage',
        resource: {
          type: 'ministry',
          churchId,
          ministryId: membership.ministryId,
        },
        scope: 'function',
      });
      if (ministryDecision.allowed) return ministryDecision;
    }
    return { allowed: false, reason: 'INSUFFICIENT_ACCESS_LEVEL' };
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

  async decideManageMinistry(
    input: CanManageMinistryInput,
  ): Promise<AuthorityDecision> {
    const { churchId, ministryId, userId } = input;
    try {
      await this.ministryRepository.getById({ churchId, id: ministryId });
    } catch (error) {
      if (error instanceof NotFoundError) {
        return { allowed: false, reason: 'RESOURCE_NOT_FOUND' };
      }
      throw error;
    }
    return this.decideAuthority({
      churchId,
      userId,
      action: 'manage',
      resource: { type: 'ministry', churchId, ministryId },
      scope: 'object',
    });
  }

  async decideManageParticipation(
    input: CanManageParticipationInput,
  ): Promise<AuthorityDecision> {
    const { churchId, participationId, userId } = input;
    const ministryId = await this.scopeRepository.resolveParticipationMinistry({
      churchId,
      participationId,
    });
    if (!ministryId) return { allowed: false, reason: 'RESOURCE_NOT_FOUND' };
    return this.decideAuthority({
      churchId,
      userId,
      action: 'manage',
      resource: { type: 'ministry', churchId, ministryId },
      scope: 'object',
    });
  }

  async decideManageShift(
    input: CanManageShiftInput,
  ): Promise<AuthorityDecision> {
    const { churchId, shiftId, userId } = input;
    const ministryId = await this.scopeRepository.resolveShiftMinistry({
      churchId,
      shiftId,
    });
    if (!ministryId) return { allowed: false, reason: 'RESOURCE_NOT_FOUND' };
    return this.decideAuthority({
      churchId,
      userId,
      action: 'manage',
      resource: { type: 'ministry', churchId, ministryId },
      scope: 'object',
    });
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
    const ministryId = await this.eventRepository.getMinistryId({
      churchId: input.churchId,
      eventId: input.eventId,
    });
    return this.canManageMinistry({ ...input, ministryId });
  }

  async canManageEventTimeBlock(
    input: CanManageEventTimeBlockInput,
  ): Promise<boolean> {
    const eventTimeBlock = await this.eventTimeBlockRepository.getById({
      churchId: input.churchId,
      eventTimeBlockId: input.eventTimeBlockId,
    });
    return this.canManageEvent({ ...input, eventId: eventTimeBlock.eventId });
  }

  async resolveCallerCapabilities(
    input: ResolveCallerCapabilitiesInput,
  ): Promise<CallerCapabilitiesProjection> {
    const { churchId } = input;
    const actor = await this.resolveActor(input);
    const churchResource = { type: 'church' as const, churchId };
    const churchDecision = AuthorityService.authorize({
      actor,
      action: 'manage',
      resource: churchResource,
    });
    const servingDecision = AuthorityService.authorize({
      actor,
      action: 'participate',
      resource: churchResource,
    });
    const ledMinistryIds = new Set(
      actor.ministryMemberships.flatMap((membership) => {
        if (
          !actor.volunteerId ||
          membership.accessLevel !== 'leader' ||
          membership.churchId !== churchId
        )
          return [];
        const decision = AuthorityService.authorize({
          actor,
          action: 'manage',
          resource: {
            type: 'ministry',
            churchId,
            ministryId: membership.ministryId,
          },
        });
        return decision.allowed ? [membership.ministryId] : [];
      }),
    );
    const ledMinistries = await Promise.all(
      [...ledMinistryIds].map(async (ministryId) => {
        const ministry = await this.ministryRepository.getById({
          churchId,
          id: ministryId,
        });
        return { ministryId, name: ministry.name };
      }),
    );
    return {
      churchId,
      isChurchAdmin: churchDecision.allowed,
      ledMinistries,
      hasVolunteerMembership: servingDecision.allowed,
    };
  }

  async hasSchedulingAccess(input: HasSchedulingAccessInput): Promise<boolean> {
    const { isChurchAdmin, ledMinistries } =
      await this.resolveCallerCapabilities(input);
    return isChurchAdmin || ledMinistries.length > 0;
  }

  private async resolveActor(input: ResolveActorInput) {
    return this.actorRepository.resolveActor({
      userId: input.userId,
      activeChurchId: input.churchId,
    });
  }
}

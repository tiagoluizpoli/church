import { inject, injectable } from 'tsyringe';
import { AuthorityService } from '../domain/authority/authority-service';
import type { ChurchId, UserId } from '../domain/branded-ids';
import type {
  CanManageChurchInput,
  CanManageEventInput,
  CanManageEventSlotInput,
  CanManageMinistryInput,
  CanManageParticipationInput,
  CanManageShiftInput,
  HasSchedulingAccessInput,
  IAuthorityManager,
  SchedulingCapabilityProjection,
} from '../domain/contracts/application/authority-manager';
import type { AuthorityActorRepository } from '../domain/contracts/infrastructure/authority-actor.repository';
import type { EventRepository } from '../domain/contracts/infrastructure/event.repository';
import type { SchedulingScopeRepository } from '../domain/contracts/infrastructure/scheduling-scope.repository';
import type { TimeSlotRepository } from '../domain/contracts/infrastructure/time-slot.repository';

interface ResolveActorInput {
  churchId: ChurchId;
  userId: UserId;
}

@injectable()
export class DbAuthorityManager implements IAuthorityManager {
  constructor(
    @inject('IAuthorityActorRepository')
    private readonly actorRepository: AuthorityActorRepository,
    @inject('ISchedulingScopeRepository')
    private readonly scopeRepository: SchedulingScopeRepository,
    @inject('IEventRepository')
    private readonly eventRepository: EventRepository,
    @inject('ITimeSlotRepository')
    private readonly timeSlotRepository: TimeSlotRepository,
  ) {}

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
    if (churchDecision.allowed) return { canAccessScheduling: true };

    const canManageLedMinistry = actor.ministryMemberships.some(
      (membership) =>
        AuthorityService.authorize({
          actor,
          action: 'manage',
          resource: {
            type: 'ministry',
            churchId: input.churchId,
            ministryId: membership.ministryId,
          },
        }).allowed,
    );
    return { canAccessScheduling: canManageLedMinistry };
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

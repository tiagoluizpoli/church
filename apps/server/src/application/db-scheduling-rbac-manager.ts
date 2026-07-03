import { inject, injectable } from 'tsyringe';
import type { ChurchId, MinistryId, UserId } from '../domain/branded-ids';
import type {
  CanManageMinistryInput,
  CanManageParticipationInput,
  CanManageShiftInput,
  SchedulingRbacManager,
} from '../domain/contracts/application/scheduling-rbac';
import type { SchedulingScopeRepository } from '../domain/contracts/infrastructure/scheduling-scope.repository';

interface CanManageInput {
  churchId: ChurchId;
  ministryId: MinistryId | null;
  userId: UserId;
}

@injectable()
export class DbSchedulingRbacManager implements SchedulingRbacManager {
  constructor(
    @inject('ISchedulingScopeRepository')
    private readonly scopes: SchedulingScopeRepository,
  ) {}

  private async canManage(input: CanManageInput): Promise<boolean> {
    if (!input.ministryId) return false;
    if (await this.scopes.isChurchAdmin(input)) return true;
    return this.scopes.isMinistryLeader({
      ...input,
      ministryId: input.ministryId,
    });
  }

  async canManageParticipation(
    input: CanManageParticipationInput,
  ): Promise<boolean> {
    const ministryId = await this.scopes.resolveParticipationMinistry(input);
    return this.canManage({ ...input, ministryId });
  }

  async canManageShift(input: CanManageShiftInput): Promise<boolean> {
    const ministryId = await this.scopes.resolveShiftMinistry(input);
    return this.canManage({ ...input, ministryId });
  }

  async canManageMinistry(input: CanManageMinistryInput): Promise<boolean> {
    return this.canManage(input);
  }
}

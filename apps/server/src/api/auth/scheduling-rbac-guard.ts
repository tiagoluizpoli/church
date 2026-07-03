import { inject, injectable } from 'tsyringe';
import type {
  CanManageParticipationInput,
  CanManageShiftInput,
  SchedulingRbacManager,
} from '../../domain/contracts/application/scheduling-rbac';

@injectable()
export class SchedulingRbacGuard {
  constructor(
    @inject('ISchedulingRbacManager')
    private readonly manager: SchedulingRbacManager,
  ) {}

  async canManageParticipation(
    input: CanManageParticipationInput,
  ): Promise<boolean> {
    return this.manager.canManageParticipation(input);
  }

  async canManageShift(input: CanManageShiftInput): Promise<boolean> {
    return this.manager.canManageShift(input);
  }
}

import type { AppConfig } from '@church/app-config';
import type { Instant } from '@church/time';
import type {
  AssignmentId,
  ChurchId,
  MinistryId,
  SwapRequestId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { SwapRequestStatus } from '../../entities/swap-request';
import type { IAuthorityManager } from '@/domain/contracts/application/authority-manager';
import type { IChurchNotifications } from '@/domain/contracts/application/church-notifications';
import type { IChurchRecipients } from '@/domain/contracts/application/church-recipients';
import type { AssignmentRepository } from '@/domain/contracts/infrastructure/assignment.repository';
import type { ChurchRepository } from '@/domain/contracts/infrastructure/church.repository';
import type { EventRepository } from '@/domain/contracts/infrastructure/event.repository';
import type { MinistryRepository } from '@/domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '@/domain/contracts/infrastructure/ministry-participation.repository';
import type { RoleRepository } from '@/domain/contracts/infrastructure/role.repository';
import type { ShiftRepository } from '@/domain/contracts/infrastructure/shift.repository';
import type { SwapRequestRepository } from '@/domain/contracts/infrastructure/swap-request.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '@/domain/contracts/infrastructure/volunteer.repository';

export interface RaiseSwapRequestCommand {
  churchId: ChurchId;
  userId: UserId;
  assignmentId: AssignmentId;
  note?: string;
}

export type WithdrawSwapRequestCommand = Omit<RaiseSwapRequestCommand, 'note'>;

export interface KeepSwapRequestCommand {
  churchId: ChurchId;
  /** The answering leader or ChurchAdmin, already authorized for `ministryId`. */
  userId: UserId;
  ministryId: MinistryId;
  swapRequestId: SwapRequestId;
  reply?: string;
}

export interface RaisedSwapRequest {
  id: SwapRequestId;
  assignmentId: AssignmentId;
  status: SwapRequestStatus;
  note?: string;
  raisedAt: Instant;
}

export interface ISwapRequestManager {
  raise(input: RaiseSwapRequestCommand): Promise<RaisedSwapRequest>;
  /** Closes the caller's open request as `withdrawn`; never touches the Assignment or notifies. */
  withdraw(input: WithdrawSwapRequestCommand): Promise<void>;
  /** Closes the open request as `kept` and enqueues N8; never touches the Assignment. */
  keep(input: KeepSwapRequestCommand): Promise<void>;
}

export interface AssertOwnAssignmentInput {
  churchId: ChurchId;
  userId: UserId;
  ownerVolunteerId: VolunteerId;
  tx?: TransactionContext;
}

export interface AssertClosedInMinistryInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  swapRequestId: SwapRequestId;
  raisedBy: UserId;
  tx: TransactionContext;
}

export interface DbSwapRequestManagerDependencies {
  swapRequestRepo: SwapRequestRepository;
  assignmentRepo: AssignmentRepository;
  participationRepo: MinistryParticipationRepository;
  shiftRepo: ShiftRepository;
  eventRepo: EventRepository;
  ministryRepo: MinistryRepository;
  roleRepo: RoleRepository;
  churchRepo: ChurchRepository;
  volunteerRepo: VolunteerRepository;
  recipients: IChurchRecipients;
  notifications: IChurchNotifications;
  authorityManager: Pick<IAuthorityManager, 'decideAuthority'>;
  unitOfWork: UnitOfWork;
  config: AppConfig;
}

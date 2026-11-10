import type { AppConfig } from '@church/app-config';
import type { db } from '@church/db';
import type { AuthorityGuard } from '../../api/auth/authority-guard';
import type {
  IActiveChurchResolver,
  IActiveChurchSelectionManager,
  IAssignmentManager,
  IAuthorityManager,
  IAvailabilityCheckManager,
  IChurchAccessManager,
  ICycleManager,
  IEventManager,
  IEventTemplateManager,
  IInvitationListManager,
  InvitationVerificationCodeManager as IInvitationVerificationCodeManager,
  IMinistryInvitationManager,
  IMinistryManager,
  IMinistryMembershipManager,
  IMinistryRoleManager,
  INotificationManager,
  IOutboxDrainer,
  IParticipationManager,
  IPeopleListManager,
  IPlanningEventManager,
  ISectorManager,
  ISwapRequestManager,
  IVolunteerManager,
  RedemptionManager,
  VolunteerTransferManager,
} from '../../domain/contracts/application';
import type {
  AssignmentAuditRepository,
  AssignmentRepository,
  AuthorityActorRepository,
  AvailabilityCheckRepository,
  ChurchAccessRepository,
  ChurchMembershipRepository,
  ChurchRepository,
  CycleRepository,
  EmailSender,
  EventRepository,
  EventTemplateRepository,
  EventTimeBlockRepository,
  InvitationListRepository,
  InvitationVerificationCodeRepository,
  MinistryInvitationRepository,
  MinistryMembershipRepository,
  MinistryParticipationRepository,
  MinistryRepository,
  NotificationRepository,
  OutboxRepository,
  PeopleListRepository,
  PlanningEventRepository,
  RedemptionIdentityGateway,
  RedemptionRepository,
  RoleRepository,
  SchedulingScopeRepository,
  SectorRepository,
  SecurityLogRepository,
  ShiftRepository,
  SwapRequestRepository,
  UnavailableShiftRepository,
  UnitOfWork,
  UsualSetupRepository,
  VerificationCodeInspector,
  VolunteerRepository,
  VolunteerTransferRepository,
} from '../../domain/contracts/infrastructure';

export interface CompositionRootDependencies {
  config: AppConfig;
  db: typeof db;
  // Repositories
  eventRepository: EventRepository;
  eventTemplateRepository: EventTemplateRepository;
  cycleRepository: CycleRepository;
  planningEventRepository: PlanningEventRepository;
  volunteerRepository: VolunteerRepository;
  assignmentRepository: AssignmentRepository;
  swapRequestRepository: SwapRequestRepository;
  assignmentAuditRepository: AssignmentAuditRepository;
  unavailableShiftRepository: UnavailableShiftRepository;
  availabilityCheckRepository: AvailabilityCheckRepository;
  churchRepository: ChurchRepository;
  ministryRepository: MinistryRepository;
  invitationVerificationCodeRepository: InvitationVerificationCodeRepository;
  ministryInvitationRepository: MinistryInvitationRepository;
  redemptionRepository: RedemptionRepository;
  volunteerTransferRepository: VolunteerTransferRepository;
  securityLogRepository: SecurityLogRepository;
  outboxRepository: OutboxRepository;
  ministryParticipationRepository: MinistryParticipationRepository;
  usualSetupRepository: UsualSetupRepository;
  shiftRepository: ShiftRepository;
  roleRepository: RoleRepository;
  sectorRepository: SectorRepository;
  eventTimeBlockRepository: EventTimeBlockRepository;
  notificationRepository: NotificationRepository;
  invitationListRepository: InvitationListRepository;
  peopleListRepository: PeopleListRepository;
  churchAccessRepository: ChurchAccessRepository;
  ministryMembershipRepository: MinistryMembershipRepository;
  unitOfWork: UnitOfWork;
  // Services
  emailSender: EmailSender;
  redemptionIdentityGateway: RedemptionIdentityGateway;
  /** Non-production only; set alongside a capturing `emailSender`. */
  verificationCodeInspector: VerificationCodeInspector;
  // Auth
  scopeRepository: SchedulingScopeRepository;
  authorityActorRepository: AuthorityActorRepository;
  authorityManager: IAuthorityManager;
  authorityGuard: AuthorityGuard;
  churchMembershipRepository: ChurchMembershipRepository;
  activeChurchResolver: IActiveChurchResolver;
  // Managers
  eventManager: IEventManager;
  eventTemplateManager: IEventTemplateManager;
  cycleManager: ICycleManager;
  planningEventManager: IPlanningEventManager;
  volunteerManager: IVolunteerManager;
  swapRequestManager: ISwapRequestManager;
  assignmentManager: IAssignmentManager;
  availabilityCheckManager: IAvailabilityCheckManager;
  ministryManager: IMinistryManager;
  ministryInvitationManager: IMinistryInvitationManager;
  ministryRoleManager: IMinistryRoleManager;
  sectorManager: ISectorManager;
  invitationVerificationCodeManager: IInvitationVerificationCodeManager;
  redemptionManager: RedemptionManager;
  volunteerTransferManager: VolunteerTransferManager;
  outboxDrainer: IOutboxDrainer;
  participationManager: IParticipationManager;
  activeChurchSelectionManager: IActiveChurchSelectionManager;
  notificationManager: INotificationManager;
  invitationListManager: IInvitationListManager;
  peopleListManager: IPeopleListManager;
  churchAccessManager: IChurchAccessManager;
  ministryMembershipManager: IMinistryMembershipManager;
}

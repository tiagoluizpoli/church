import type { AppConfig } from '@church/app-config';
import type { db } from '@church/db';
import type { AuthorityGuard } from '../../api/auth/authority-guard';
import type {
  IActiveChurchResolver,
  IActiveChurchSelectionManager,
  IAssignmentManager,
  IAuthorityManager,
  IAvailabilityCheckManager,
  ICycleManager,
  IEventManager,
  IEventTemplateManager,
  InvitationVerificationCodeManager as IInvitationVerificationCodeManager,
  IMinistryInvitationManager,
  IMinistryManager,
  IOutboxDrainer,
  IParticipationManager,
  IPlanningEventManager,
  IVolunteerManager,
  RedemptionManager,
  VolunteerTransferManager,
} from '../../domain/contracts/application';
import type {
  AssignmentAuditRepository,
  AssignmentRepository,
  AuthorityActorRepository,
  AvailabilityCheckRepository,
  ChurchMembershipRepository,
  ChurchRepository,
  CycleRepository,
  EmailSender,
  EventRepository,
  EventTemplateRepository,
  EventTimeBlockRepository,
  InvitationVerificationCodeRepository,
  MinistryInvitationRepository,
  MinistryParticipationRepository,
  MinistryRepository,
  NotificationService,
  OutboxRepository,
  PlanningEventRepository,
  RedemptionIdentityGateway,
  RedemptionRepository,
  RoleRepository,
  SchedulingScopeRepository,
  SecurityLogRepository,
  ShiftRepository,
  TeamRepository,
  UnavailableShiftRepository,
  UnitOfWork,
  UsualSetupRepository,
  VerificationCodeInspector,
  VolunteerNotificationRepository,
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
  teamRepository: TeamRepository;
  eventTimeBlockRepository: EventTimeBlockRepository;
  volunteerNotificationRepository: VolunteerNotificationRepository;
  unitOfWork: UnitOfWork;
  // Services
  notificationService: NotificationService;
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
  assignmentManager: IAssignmentManager;
  availabilityCheckManager: IAvailabilityCheckManager;
  ministryManager: IMinistryManager;
  ministryInvitationManager: IMinistryInvitationManager;
  invitationVerificationCodeManager: IInvitationVerificationCodeManager;
  redemptionManager: RedemptionManager;
  volunteerTransferManager: VolunteerTransferManager;
  outboxDrainer: IOutboxDrainer;
  participationManager: IParticipationManager;
  activeChurchSelectionManager: IActiveChurchSelectionManager;
}

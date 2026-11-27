import type { AppConfig } from '@church/app-config';
import type { db } from '@church/db';
import type { AuthorityGuard } from '../../api/auth/authority-guard';
import type {
  IActiveChurchResolver,
  IActiveChurchSelectionManager,
  IAssignmentManager,
  IAssignmentProposalManager,
  IAuthorityManager,
  IAvailabilityCheckManager,
  IChurchAccessManager,
  IChurchSettingsManager,
  ICycleManager,
  IEventManager,
  IEventTemplateManager,
  IInvitationListManager,
  IInvitationVerificationCodeManager,
  IMinistryInvitationManager,
  IMinistryManager,
  IMinistryMembershipManager,
  IMinistryRoleManager,
  INotificationManager,
  IOutboxDrainer,
  IPeopleListManager,
  IPlanningEventManager,
  IPrepareManager,
  IPublicChurchProfileManager,
  IPublicEventManager,
  IRedemptionManager,
  IScheduleBuilderReader,
  ISchedulePublisher,
  IScheduleReadModel,
  ISectorManager,
  ISetupProgressManager,
  ISwapRequestListManager,
  ISwapRequestManager,
  IUsualSetupManager,
  IVolunteerManager,
  IVolunteerTransferManager,
} from '../../domain/contracts/application';
import type {
  AssignmentAuditRepository,
  AssignmentProposalApplicationRepository,
  AssignmentRepository,
  AuthorityActorRepository,
  AvailabilityCheckRepository,
  ChurchAccessRepository,
  ChurchMembershipRepository,
  ChurchProgrammeRepository,
  ChurchRepository,
  CycleRepository,
  EmailSender,
  ErrorReporter,
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
  ObjectStorage,
  OutboxRepository,
  PeopleListRepository,
  PlanningEventRepository,
  PublicEventRepository,
  RedemptionIdentityGateway,
  RedemptionRepository,
  RoleRepository,
  SchedulingScopeRepository,
  SectorRepository,
  SecurityLogRepository,
  SetupProgressRepository,
  ShiftRepository,
  SwapRequestRepository,
  TemplatePrecedenceRepository,
  Tracing,
  UnavailableShiftRepository,
  UnitOfWork,
  UsualSetupRepository,
  VerificationCodeInspector,
  VolunteerRepository,
  VolunteerTransferRepository,
  WebShell,
} from '../../domain/contracts/infrastructure';

export interface CompositionRootDependencies {
  config: AppConfig;
  db: typeof db;
  // Repositories
  eventRepository: EventRepository;
  eventTemplateRepository: EventTemplateRepository;
  templatePrecedenceRepository: TemplatePrecedenceRepository;
  cycleRepository: CycleRepository;
  planningEventRepository: PlanningEventRepository;
  volunteerRepository: VolunteerRepository;
  assignmentRepository: AssignmentRepository;
  swapRequestRepository: SwapRequestRepository;
  assignmentAuditRepository: AssignmentAuditRepository;
  assignmentProposalApplicationRepository: AssignmentProposalApplicationRepository;
  unavailableShiftRepository: UnavailableShiftRepository;
  availabilityCheckRepository: AvailabilityCheckRepository;
  churchRepository: ChurchRepository;
  publicEventRepository: PublicEventRepository;
  churchProgrammeRepository: ChurchProgrammeRepository;
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
  setupProgressRepository: SetupProgressRepository;
  churchAccessRepository: ChurchAccessRepository;
  ministryMembershipRepository: MinistryMembershipRepository;
  unitOfWork: UnitOfWork;
  // Services
  emailSender: EmailSender;
  redemptionIdentityGateway: RedemptionIdentityGateway;
  /** Non-production only; set alongside a capturing `emailSender`. */
  verificationCodeInspector: VerificationCodeInspector;
  errorReporter: ErrorReporter;
  tracing: Tracing;
  /** S3 from the env; HTTP tests inject the in-memory fake. */
  objectStorage: ObjectStorage;
  /** The deployed web's index.html; HTTP tests inject a fake. */
  webShell: WebShell;
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
  swapRequestListManager: ISwapRequestListManager;
  assignmentManager: IAssignmentManager;
  availabilityCheckManager: IAvailabilityCheckManager;
  ministryManager: IMinistryManager;
  ministryInvitationManager: IMinistryInvitationManager;
  ministryRoleManager: IMinistryRoleManager;
  sectorManager: ISectorManager;
  invitationVerificationCodeManager: IInvitationVerificationCodeManager;
  redemptionManager: IRedemptionManager;
  volunteerTransferManager: IVolunteerTransferManager;
  outboxDrainer: IOutboxDrainer;
  prepareManager: IPrepareManager;
  usualSetupManager: IUsualSetupManager;
  scheduleBuilderReader: IScheduleBuilderReader;
  assignmentProposalManager: IAssignmentProposalManager;
  scheduleReadModel: IScheduleReadModel;
  schedulePublisher: ISchedulePublisher;
  activeChurchSelectionManager: IActiveChurchSelectionManager;
  notificationManager: INotificationManager;
  invitationListManager: IInvitationListManager;
  peopleListManager: IPeopleListManager;
  setupProgressManager: ISetupProgressManager;
  churchAccessManager: IChurchAccessManager;
  churchSettingsManager: IChurchSettingsManager;
  publicChurchProfileManager: IPublicChurchProfileManager;
  publicEventManager: IPublicEventManager;
  ministryMembershipManager: IMinistryMembershipManager;
}

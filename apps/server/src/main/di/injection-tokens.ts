export const injection = {
  infra: {
    eventRepository: 'IEventRepository',
    volunteerRepository: 'IVolunteerRepository',
    assignmentRepository: 'IAssignmentRepository',
    assignmentAuditRepository: 'IAssignmentAuditRepository',
    availabilityRepository: 'IAvailabilityRepository',
    churchRepository: 'IChurchRepository',
    ministryRepository: 'IMinistryRepository',
    roleRepository: 'IRoleRepository',
    teamRepository: 'ITeamRepository',
    timeSlotRepository: 'ITimeSlotRepository',
    volunteerNotificationRepository: 'IVolunteerNotificationRepository',
    unitOfWork: 'IUnitOfWork',
    notificationService: 'INotificationService',
    featureFlagService: 'IFeatureFlagService',
  },
  managers: {
    eventManager: 'IEventManager',
    volunteerManager: 'IVolunteerManager',
    assignmentManager: 'IAssignmentManager',
    ministryManager: 'IMinistryManager',
    featureFlagManager: 'IFeatureFlagManager',
  },
  auth: {
    scopeRepository: 'ISchedulingScopeRepository',
    manager: 'ISchedulingRbacManager',
    schedulingRbacResolver: 'SchedulingRbacResolver',
  },
  controllers: {
    fastify: 'FastifyController',
  },
} as const;

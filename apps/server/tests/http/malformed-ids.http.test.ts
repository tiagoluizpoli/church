import { appConfig } from '@church/app-config';
import { m } from '@church/i18n/messages';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EventController } from '@/api/controllers/event-controller';
import { MinistryController } from '@/api/controllers/ministry-controller';
import { MinistryRoleController } from '@/api/controllers/ministry-role-controller';
import { PeopleController } from '@/api/controllers/people-controller';
import { PrepareController } from '@/api/controllers/prepare-controller';
import { SectorController } from '@/api/controllers/sector-controller';
import { SwapRequestController } from '@/api/controllers/swap-request-controller';
import { UsualSetupController } from '@/api/controllers/usual-setup-controller';
import { VolunteerController } from '@/api/controllers/volunteer-controller';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';

vi.mock('@/main/di/server-auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue({
        user: { id: 'user-1' },
        session: { activeOrganizationId: null },
      }),
    },
  },
}));

const CHURCH_ID = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';
const BAD = 'not-a-uuid';
const UNPROCESSABLE = 422;

const activeChurchResolver = {
  resolve: vi.fn().mockResolvedValue({
    status: 'resolved',
    churchId: CHURCH_ID,
    volunteerId: '33333333-3333-4333-8333-333333333333',
    hasVolunteerMembership: true,
    autoSelected: false,
  }),
};
// Managers are empty on purpose: a malformed id must be refused before any
// manager or guard runs, so reaching one would surface as a 500 TypeError.
const none = {} as never;
const deps = {
  activeChurchResolver: activeChurchResolver as never,
  authorityGuard: none,
};

/** [family, method, url, the malformed field]. */
const ROUTES = [
  ['ministry', 'GET', `/ministries/${BAD}`, 'ministryId'],
  ['ministry', 'PATCH', `/ministries/${BAD}`, 'ministryId'],
  ['ministry', 'POST', `/ministries/${BAD}/archive`, 'ministryId'],
  ['ministry', 'POST', `/ministries/${BAD}/invitations`, 'ministryId'],
  [
    'ministry',
    'POST',
    `/ministries/${ID}/invitations/${BAD}/resend`,
    'invitationId',
  ],
  [
    'ministry',
    'POST',
    `/ministries/${ID}/invitations/${BAD}/revoke`,
    'invitationId',
  ],
  ['ministry-role', 'GET', `/ministries/${BAD}/roles`, 'ministryId'],
  ['ministry-role', 'POST', `/ministries/${BAD}/roles`, 'ministryId'],
  ['ministry-role', 'PATCH', `/ministries/${ID}/roles/${BAD}`, 'roleId'],
  ['ministry-role', 'POST', `/ministries/${ID}/roles/${BAD}/archive`, 'roleId'],
  ['sector', 'GET', `/ministries/${BAD}/sectors`, 'ministryId'],
  ['sector', 'POST', `/ministries/${BAD}/sectors`, 'ministryId'],
  ['sector', 'PATCH', `/ministries/${ID}/sectors/${BAD}`, 'sectorId'],
  ['sector', 'POST', `/ministries/${ID}/sectors/${BAD}/archive`, 'sectorId'],
  ['usual-setup', 'GET', `/ministries/${BAD}/usual-setup`, 'ministryId'],
  [
    'usual-setup',
    'PUT',
    `/ministries/${ID}/usual-setup/${BAD}`,
    'sourceTemplateTimeBlockId',
  ],
  [
    'prepare',
    'GET',
    `/prepare/cycles/${BAD}/participation?ministryId=${ID}`,
    'cycleId',
  ],
  [
    'prepare',
    'GET',
    `/prepare/cycles/${ID}/participation?ministryId=${BAD}`,
    'ministryId',
  ],
  [
    'prepare',
    'GET',
    `/prepare/cycles/${BAD}/ask-preview?ministryId=${ID}`,
    'cycleId',
  ],
  [
    'prepare',
    'GET',
    `/prepare/cycles/${ID}/ask-preview?ministryId=${BAD}`,
    'ministryId',
  ],
  ['prepare', 'GET', `/prepare/ministries/${BAD}/cycles-summary`, 'ministryId'],
  [
    'prepare',
    'PUT',
    `/prepare/participations/${BAD}/event-time-blocks/${ID}/preparation`,
    'participationId',
  ],
  [
    'prepare',
    'PUT',
    `/prepare/participations/${ID}/event-time-blocks/${BAD}/preparation`,
    'eventTimeBlockId',
  ],
  ['prepare', 'POST', `/prepare/cycles/${BAD}/ask-availability`, 'cycleId'],
  ['prepare', 'PUT', `/prepare/cycles/${BAD}/availability-deadline`, 'cycleId'],
  ['prepare', 'POST', `/prepare/cycles/${BAD}/remind-availability`, 'cycleId'],
  [
    'prepare',
    'GET',
    `/prepare/cycles/${BAD}/availability-status?ministryId=${ID}`,
    'cycleId',
  ],
  [
    'prepare',
    'GET',
    `/prepare/cycles/${ID}/availability-status?ministryId=${BAD}`,
    'ministryId',
  ],
  [
    'swap-request',
    'POST',
    `/volunteer/assignments/${BAD}/swap-requests`,
    'assignmentId',
  ],
  [
    'swap-request',
    'DELETE',
    `/volunteer/assignments/${BAD}/swap-requests/current`,
    'assignmentId',
  ],
  ['volunteer', 'GET', `/volunteer/assignments/${BAD}`, 'assignmentId'],
  [
    'volunteer',
    'GET',
    `/volunteer/ministries/${BAD}/schedule?cycleId=${ID}`,
    'ministryId',
  ],
  ['volunteer', 'GET', `/volunteer/availability-checks/${BAD}`, 'checkId'],
  [
    'volunteer',
    'PUT',
    `/volunteer/availability-checks/${BAD}/answer`,
    'checkId',
  ],
  ['event', 'GET', `/events?ministryId=${BAD}`, 'ministryId'],
  ['event', 'GET', `/events/schedule-builder?eventId=${BAD}`, 'eventId'],
  [
    'event',
    'GET',
    `/events/schedule-builder?eventId=${ID}&ministryId=${BAD}`,
    'ministryId',
  ],
  [
    'people',
    'DELETE',
    `/people/user-1/ministry-memberships/${BAD}`,
    'membershipId',
  ],
] as const;

/**
 * Routes whose declared 422 body is `{ error, message }`, so the issues are
 * not sent: each gets a valid body, leaving the id as the only thing wrong.
 */
const ISSUELESS_ROUTES = [
  [
    'people',
    'PUT',
    `/people/user-1/ministry-memberships/${BAD}/roles`,
    { roleIds: [] },
  ],
  [
    'people',
    'PATCH',
    `/people/user-1/ministry-memberships/${BAD}/access`,
    { accessLevel: 'volunteer' },
  ],
] as const;

interface ValidationIssue {
  instancePath: string;
}

let app: FastifyTypedInstance;

beforeAll(async () => {
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  const controllers = [
    new MinistryController({
      ...deps,
      config: appConfig,
      ministryManager: none,
      ministryInvitationManager: none,
    }),
    new MinistryRoleController({ ...deps, ministryRoleManager: none }),
    new SectorController({
      ...deps,
      ministryManager: none,
      sectorManager: none,
    }),
    new UsualSetupController({
      ...deps,
      ministryManager: none,
      usualSetupManager: none,
    }),
    new PrepareController({
      ...deps,
      config: appConfig,
      prepareManager: none,
      scheduleReadModel: none,
      availabilityCheckManager: none,
    }),
    new SwapRequestController({ ...deps, swapRequestManager: none }),
    new VolunteerController({ ...deps, volunteerManager: none }),
    new EventController({ ...deps, eventManager: none }),
    new PeopleController({
      ...deps,
      config: appConfig,
      peopleListManager: none,
      churchAccessManager: none,
      ministryMembershipManager: none,
    }),
  ];
  await app.register(
    async (instance) => {
      for (const controller of controllers) {
        instance.register(controller.registerRoutes.bind(controller), {
          prefix: controller.prefix,
        });
      }
    },
    { prefix: '/api/v1' },
  );
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('malformed ids', () => {
  it.each(
    ROUTES,
  )('%s: %s %s answers the validation error', async (_family, method, url, field) => {
    const response = await app.inject({
      method,
      url: `/api/v1${url}`,
      payload: {} as never,
    });

    expect(response.statusCode).toBe(UNPROCESSABLE);
    const body = response.json();
    expect(body).toMatchObject({
      error: 'VALIDATION_ERROR',
      message: m.common_validation_error(
        {},
        { locale: testLocale.defaultLocale },
      ),
    });
    expect(
      (body.issues as ValidationIssue[]).map((issue) => issue.instancePath),
    ).toContain(`/${field}`);
  });

  it.each(
    ISSUELESS_ROUTES,
  )('%s: %s %s answers the validation error', async (_family, method, url, payload) => {
    const response = await app.inject({
      method,
      url: `/api/v1${url}`,
      payload,
    });

    expect(response.statusCode).toBe(UNPROCESSABLE);
    expect(response.json()).toEqual({
      error: 'VALIDATION_ERROR',
      message: m.common_validation_error(
        {},
        { locale: testLocale.defaultLocale },
      ),
    });
  });
});

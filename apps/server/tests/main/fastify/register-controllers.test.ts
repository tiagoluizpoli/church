import { appConfig, withAllParkedOn } from '@church/app-config';
import { m } from '@church/i18n/messages';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCompositionRoot } from '@/main/di/composition-root';
import { registerControllers } from '@/main/fastify/register-controllers';
import { createFastify } from '@/main/fastify/setup';
import type { FastifyTypedInstance } from '@/main/fastify/types';
import { testErrorReporter } from '@/tests/test-support/error-report-capture';
import { testLocale } from '@/tests/test-support/fastify-locale';

type OpenApiOperation = {
  operationId?: string;
  responses?: Record<string, unknown>;
};

let app: FastifyTypedInstance;

beforeAll(async () => {
  // As the OpenAPI export builds it: parked routes stay in the contract.
  const root = createCompositionRoot({ config: withAllParkedOn(appConfig) });
  app = await createFastify({
    locale: testLocale,
    errorReporter: testErrorReporter,
  });
  await app.register(
    async (instance) =>
      registerControllers({ app: instance, controllers: root.controllers }),
    { prefix: '/api/v1' },
  );
  await app.ready();
});

afterAll(async () => app.close());

function declaredStatuses({ operationId }: { operationId: string }): string[] {
  const paths = app.swagger().paths as Record<
    string,
    Record<string, OpenApiOperation>
  >;
  for (const item of Object.values(paths)) {
    for (const operation of Object.values(item)) {
      if (operation.operationId === operationId) {
        return Object.keys(operation.responses ?? {}).sort();
      }
    }
  }
  throw new Error(`No operation ${operationId}`);
}

const ID = '11111111-1111-4111-8111-111111111111';

describe('the Active Church hook refusal body', () => {
  // A declared response schema serializes the body: it must stay exactly
  // the `{ error, message }` the hook sends.
  it.each([
    ['GET', '/api/v1/volunteer/dashboard'],
    ['GET', '/api/v1/volunteer/schedule'],
    ['POST', `/api/v1/volunteer/assignments/${ID}/swap-requests`],
    ['DELETE', `/api/v1/volunteer/assignments/${ID}/swap-requests/current`],
    ['GET', `/api/v1/ministries/${ID}/swap-requests`],
    ['POST', `/api/v1/ministries/${ID}/swap-requests/${ID}/keep`],
    ['GET', `/api/v1/assign/cycles/${ID}/builder`],
    ['DELETE', `/api/v1/assign/assignments/${ID}`],
    ['GET', '/api/v1/people/'],
    ['GET', '/api/v1/admin/setup-progress'],
    ['DELETE', `/api/v1/admin/cycles/${ID}`],
    ['DELETE', `/api/v1/admin/event-templates/${ID}`],
    ['GET', '/api/v1/notifications'],
  ] as const)('%s %s answers 401 without a session', async (method, url) => {
    const response = await app.inject({ method, url });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: 'UNAUTHORIZED',
      message: m.error_unauthorized({}, { locale: testLocale.defaultLocale }),
    });
  });
});

describe('declared response statuses (#1226)', () => {
  // The Active Church hook answers 401 without a session and 403 without a
  // Church Membership (or, where a Volunteer profile is required, without one).
  it.each([
    ['getVolunteerDashboard', ['200', '401', '403']],
    ['getAssignmentDetail', ['200', '401', '403', '404']],
    ['getMinistrySchedule', ['200', '401', '403', '404']],
    ['listAvailabilityChecks', ['200', '401', '403']],
    ['getAvailabilityCheck', ['200', '401', '403', '404']],
    ['answerAvailabilityCheck', ['200', '401', '403', '404', '409']],
    ['getPublishedVolunteerSchedule', ['200', '401', '403']],
    ['raiseSwapRequest', ['201', '400', '401', '403', '404', '409']],
    ['withdrawSwapRequest', ['204', '401', '403', '404', '409']],
    ['listMinistrySwapRequests', ['200', '401', '403', '404']],
    ['keepSwapRequest', ['204', '401', '403', '404', '409']],
    ['getCycleBuilderData', ['200', '401', '403', '404']],
    ['getCycleAuditLog', ['200', '401', '403', '404']],
    ['getAssignmentProposal', ['200', '401', '403', '404', '409']],
    ['applyAssignmentProposal', ['200', '401', '403', '404', '409', '422']],
    ['publishCycle', ['200', '401', '403', '404', '409']],
    ['sendScheduleUpdates', ['200', '401', '403', '404', '409']],
    ['listEligibleVolunteers', ['200', '401', '403', '404']],
    ['createParticipationAssignment', ['201', '401', '403', '404']],
    ['deleteParticipationAssignment', ['204', '401', '403', '404']],
    ['moveParticipationAssignment', ['200', '401', '403', '404']],
    ['reassignParticipationAssignment', ['200', '401', '403', '404']],
    ['getParticipationCompletion', ['200', '401', '403', '404']],
  ])('%s declares the 401 and 403 its hook sends', (operationId, statuses) => {
    expect(declaredStatuses({ operationId })).toEqual(statuses);
  });

  it('listPeople declares no 404: a caller without People scope gets 403', () => {
    expect(declaredStatuses({ operationId: 'listPeople' })).toEqual([
      '200',
      '401',
      '403',
    ]);
  });

  // The hook sends 409 until an Active Church is chosen and the querystring
  // refuses a bad cursor or page size with 422 (notification-controller tests).
  it('getNotifications keeps the 409 and 422 it sends', () => {
    expect(declaredStatuses({ operationId: 'getNotifications' })).toEqual([
      '200',
      '401',
      '403',
      '409',
      '422',
    ]);
  });

  it.each([
    'deleteCycle',
    'deleteEventTemplate',
  ])('%s declares its 204 like every other delete', (operationId) => {
    expect(declaredStatuses({ operationId })).toEqual(['204']);
  });
});

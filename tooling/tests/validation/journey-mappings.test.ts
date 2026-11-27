import { describe, expect, it } from 'bun:test';
import { classifyChanges } from '../../validation/affected';

const spec = (name: string) => `tests/scheduling/${name}.spec.ts`;
const specs = (...names: string[]) => names.map(spec).sort();

const A11Y = 'a11y-builder';
const FOCUS = 'builder-event-time-block-focus';
const GUARD = 'planning-role-guard-matrix';
const QUALIFICATION = 'qualification';
const SMOKE = 'smoke';
const INDEX = 'capability-index';
const J6 = 'j6-leader-availability';
const J9 = 'j9-swap-request';
const J10 = 'j10-admin-cancel';
const J11 = 'j11-admin-edit-event';
const PUBLISH = 'us4-schedule-publish';
const PREPARE = 'us2-leader-prepare';
const REASSIGN = 'us5-leader-reassign';
const HANDOFF = 'us1-admin-plan';
const AVAILABILITY = 'us3-volunteer-availability';

const ASSIGNMENT = [QUALIFICATION, FOCUS, REASSIGN, PUBLISH, J9];
const BUILDER = [A11Y, FOCUS, GUARD, QUALIFICATION, SMOKE];
const PREPARE_SET = [GUARD, SMOKE, PREPARE, PUBLISH];
const SCHEDULE_LIST = [INDEX, GUARD, PREPARE];

const unique = (...names: string[]) => specs(...new Set(names));

const SERVER = 'apps/server/src/';
const WEB_UTILS = 'apps/web/src/features/scheduling/utils/';
const APPLICATION = `${SERVER}application/`;
const CONTRACTS = `${SERVER}domain/contracts/application/`;
const REPOSITORIES = `${SERVER}infrastructure/repositories/`;
const MINISTRIES = 'tests/ministries/ministries-directory.spec.ts';
const BELL = 'tests/volunteer-dashboard/us-notification-bell.spec.ts';
const PUBLIC_PROFILE = 'tests/public-church/public-church-profile.spec.ts';

const USUAL_SETUP = [MINISTRIES, ...specs(...PREPARE_SET)].sort();
const CRITICAL_AND_LISTS = [
  'tests/identity/active-church-switching.spec.ts',
  'tests/identity/redemption-existing-member.spec.ts',
  'tests/identity/redemption-new-user.spec.ts',
  ...unique(...SCHEDULE_LIST, ...PREPARE_SET, AVAILABILITY),
];

const bothApplication = (name: string) => [
  `${APPLICATION}db-${name}.ts`,
  `${CONTRACTS}${name}.ts`,
];

const CASES: [paths: string[], expected: string[]][] = [
  [bothApplication('assignment-manager'), unique(...ASSIGNMENT)],
  [
    [
      `${APPLICATION}assignment-lifecycle.ts`,
      `${CONTRACTS}assignment-lifecycle.ts`,
    ],
    unique(...ASSIGNMENT, J10),
  ],
  [bothApplication('assignment-proposal-manager'), specs(PUBLISH)],
  [[`${SERVER}domain/services/assignment-proposal.ts`], specs(PUBLISH)],
  [
    [
      `${SERVER}domain/services/assignment-eligibility.ts`,
      `${SERVER}domain/services/assignment-eligibility.types.ts`,
    ],
    unique(...ASSIGNMENT, ...BUILDER),
  ],
  [
    [`${SERVER}domain/event-time-block-cancellation.ts`],
    unique(...ASSIGNMENT, ...BUILDER, J10),
  ],
  [[`${SERVER}domain/errors/shift-started.ts`], unique(...ASSIGNMENT)],
  [
    [`${SERVER}domain/entities/shift.ts`],
    unique(...ASSIGNMENT, ...PREPARE_SET),
  ],
  [
    [
      `${SERVER}api/dtos/assign.dto.ts`,
      `${SERVER}api/dtos/cycle-builder.dto.ts`,
      `${WEB_UTILS}scheduling-rules.ts`,
      `${WEB_UTILS}shift-verdict.ts`,
    ],
    unique(...ASSIGNMENT, ...BUILDER),
  ],
  [bothApplication('schedule-builder-reader'), unique(...BUILDER)],
  [bothApplication('schedule-publisher'), specs(PUBLISH, SMOKE)],
  [bothApplication('schedule-change-reader'), specs(PUBLISH, J9, J11)],
  [
    bothApplication('schedule-read-model'),
    unique(...SCHEDULE_LIST, ...PREPARE_SET),
  ],
  [
    [
      ...bothApplication('prepare-manager'),
      `${APPLICATION}participation-view-filter.ts`,
    ],
    unique(...SCHEDULE_LIST, ...PREPARE_SET, J6),
  ],
  [
    bothApplication('participation-reader'),
    unique(...BUILDER, ...PREPARE_SET, PUBLISH),
  ],
  [
    [
      ...bothApplication('usual-setup-manager'),
      `${SERVER}api/controllers/usual-setup-controller.ts`,
      `${SERVER}api/dtos/usual-setup.dto.ts`,
    ],
    USUAL_SETUP,
  ],
  [[`${CONTRACTS}usual-setup-staffing-seeder.ts`], specs(HANDOFF)],
  [[`${CONTRACTS}availability-check-manager.ts`], specs(J6)],
  [[`${REPOSITORIES}live-event-time-block.ts`], unique(...PREPARE_SET, J6)],
  [
    [`${REPOSITORIES}drizzle-availability-check.repository.types.ts`],
    specs(J6),
  ],
  [
    [`${REPOSITORIES}drizzle-ministry-participation.repository.types.ts`],
    [...CRITICAL_AND_LISTS].sort(),
  ],
  [[`${REPOSITORIES}drizzle-planning-event.repository.types.ts`], specs(J10)],
  [
    [`${REPOSITORIES}drizzle-public-event.repository.types.ts`],
    [PUBLIC_PROFILE],
  ],
  [
    [`${CONTRACTS}volunteer-manager.ts`],
    [BELL, ...specs(AVAILABILITY, REASSIGN, J10)].sort(),
  ],
];

describe('scheduling modules select their journeys, not the smoke fallback', () => {
  for (const [paths, expected] of CASES) {
    for (const changedPath of paths) {
      it(changedPath, () => {
        const plan = classifyChanges({ changedPaths: [changedPath] });

        expect(plan.e2eSpecPaths).toEqual(expected);
        expect(plan.missingJourneyMappings).toEqual([]);
      });
    }
  }
});

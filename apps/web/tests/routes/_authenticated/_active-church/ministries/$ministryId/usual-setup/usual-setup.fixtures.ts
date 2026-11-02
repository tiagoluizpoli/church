import type {
  ListUsualSetup200,
  ListUsualSetup200BlocksItem,
} from '@/infrastructure/api/churchAPI.schemas';

export const MINISTRY_ID = '33333333-3333-4333-8333-333333333331';
export const WELCOME_ID = '55555555-5555-4555-8555-555555555551';
export const SERVICE_ID = '55555555-5555-4555-8555-555555555552';
export const NIGHT_ID = '55555555-5555-4555-8555-555555555553';

export const WORSHIP = {
  id: MINISTRY_ID,
  churchId: 'church-1',
  name: 'Worship',
  defaultDirection: 'all_out',
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};

export const SECTORS = [
  { id: 'sector-stage', name: 'Stage' },
  { id: 'sector-door', name: 'Door' },
];
export const ROLES = [{ id: 'role-singer', name: 'Singer' }];

const SUNDAY = {
  templateId: 'template-sunday',
  templateName: 'Sunday',
  weekday: 0,
};

export const WELCOME: ListUsualSetup200BlocksItem = {
  ...SUNDAY,
  sourceTemplateTimeBlockId: WELCOME_ID,
  label: 'Welcome',
  startTime: '09:00',
  endTime: '10:00',
  order: 0,
};

export const SERVICE: ListUsualSetup200BlocksItem = {
  ...SUNDAY,
  sourceTemplateTimeBlockId: SERVICE_ID,
  label: 'Service',
  startTime: '10:00',
  endTime: '12:00',
  order: 1,
  entry: {
    serves: true,
    shiftSplit: { kind: 'equal', count: 1 },
    headcounts: [
      {
        shiftIndex: 0,
        sectorId: 'sector-stage',
        roleId: 'role-singer',
        peopleNeeded: 2,
      },
      {
        shiftIndex: 0,
        sectorId: 'sector-door',
        roleId: 'role-singer',
        peopleNeeded: 1,
      },
    ],
  },
};

export const NIGHT: ListUsualSetup200BlocksItem = {
  templateId: 'template-vigil',
  templateName: 'Vigil',
  weekday: 6,
  sourceTemplateTimeBlockId: NIGHT_ID,
  label: 'Night',
  startTime: '22:00',
  endTime: '02:00',
  order: 0,
  entry: {
    serves: false,
    shiftSplit: { kind: 'equal', count: 1 },
    headcounts: [],
  },
};

export function setupOf(
  ...blocks: ListUsualSetup200BlocksItem[]
): ListUsualSetup200 {
  return { blocks };
}

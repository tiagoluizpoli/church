import { event, eventTimeBlock } from '@church/db';
import {
  parseCalendarDay,
  parseTimeOfDay,
  type TimeOfDay,
  toInstant,
} from '@church/time';
import { eq } from 'drizzle-orm';
import { buildChurch, buildChurchMembership } from '@/seeds/builders/church';
import { buildUser } from '@/seeds/builders/identity';
import {
  buildMinistry,
  buildRole,
  buildSector,
} from '@/seeds/builders/ministry';
import {
  buildAssignment,
  buildCycle,
  buildEvent,
  buildEventTimeBlock,
  buildMinistryParticipation,
  buildShift,
  buildShiftRequirement,
} from '@/seeds/builders/scheduling';
import {
  buildMinistryMembership,
  buildVolunteer,
} from '@/seeds/builders/volunteer';
import { schedulingTestDb } from '@/tests/scheduling-reshape/setup';

/**
 * The Kids Ministry's October Schedule the export suites read: split Shifts,
 * a block the Ministry does not serve, a cancelled Event and block, hidden
 * cancelled scopes, a multi-day retreat and two clashing names.
 */

const db = schedulingTestDb;
const TIME_ZONE = 'America/Sao_Paulo';
export const EXPORT_CHURCH_A = '81111111-1111-4111-8111-111111111111';
export const EXPORT_CHURCH_B = '82222222-2222-4222-8222-222222222222';

/** `leader` leads Kids; `otherLeader` leads Worship. */
export type ExportPersona =
  | 'admin'
  | 'leader'
  | 'otherLeader'
  | 'volunteer'
  | 'member';

interface PersonaRecord {
  userId: string;
  volunteerId: string | null;
}

interface PersonaInput {
  key: ExportPersona;
  churchAccess: 'admin' | 'member';
  membership?: { ministryId: string; level: 'leader' | 'volunteer' };
}

async function persona({
  key,
  churchAccess,
  membership,
}: PersonaInput): Promise<PersonaRecord> {
  const userId = `export-${key}`;
  await buildUser({ db, id: userId, name: key, email: `${key}@export.test` });
  await buildChurchMembership({
    db,
    churchId: EXPORT_CHURCH_A,
    userId,
    accessLevel: churchAccess,
  });
  if (!membership) return { userId, volunteerId: null };
  const volunteer = await buildVolunteer({
    db,
    churchId: EXPORT_CHURCH_A,
    userId,
  });
  await buildMinistryMembership({
    db,
    churchId: EXPORT_CHURCH_A,
    volunteerId: volunteer.id,
    ministryId: membership.ministryId,
    ministryAccessLevel: membership.level,
    roleIds: [],
  });
  return { userId, volunteerId: volunteer.id };
}

/** A Church-local wall clock in São Paulo. */
export function local(day: string, time: string) {
  return toInstant({
    day: parseCalendarDay({ value: day }),
    time: parseTimeOfDay({ value: time }) as TimeOfDay,
    timeZone: TIME_ZONE,
  });
}

export async function seedScheduleExport() {
  await buildChurch({
    db,
    id: EXPORT_CHURCH_A,
    name: 'Igreja A',
    slug: 'export-a',
    timezone: TIME_ZONE,
  });
  await buildChurch({
    db,
    id: EXPORT_CHURCH_B,
    name: 'Igreja B',
    slug: 'export-b',
    timezone: 'UTC',
  });
  const churchId = EXPORT_CHURCH_A;
  const kids = await buildMinistry({ db, churchId, name: 'Kids' });
  const worship = await buildMinistry({ db, churchId, name: 'Worship' });
  const foreign = await buildMinistry({
    db,
    churchId: EXPORT_CHURCH_B,
    name: 'Foreign',
  });
  const child = { db, churchId, ministryId: kids.id };
  // Created out of order: the palette index is alphabetical in the Ministry.
  const maternal = await buildSector({ ...child, name: 'Maternal' });
  const bercario = await buildSector({ ...child, name: 'Berçário' });
  await buildSector({ ...child, name: 'Acolhida' });
  const professor = await buildRole({ ...child, name: 'Professor' });
  const auxiliar = await buildRole({ ...child, name: 'Auxiliar' });

  const people: Record<string, string> = {};
  for (const name of [
    'Carla Dias',
    'Bruno Lima',
    'Ana Souza',
    'Ána  Souza',
    'Davi Rocha',
  ]) {
    const userId = `export-person-${Object.keys(people).length}`;
    await buildUser({ db, id: userId, name, email: `${userId}@export.test` });
    const volunteer = await buildVolunteer({ db, churchId, userId });
    await buildMinistryMembership({
      db,
      churchId,
      volunteerId: volunteer.id,
      ministryId: kids.id,
      ministryAccessLevel: 'volunteer',
      roleIds: [],
    });
    people[name] = volunteer.id;
  }

  const october = await buildCycle({
    db,
    churchId,
    name: 'Outubro 2026',
    state: 'sent',
    startDate: parseCalendarDay({ value: '2026-10-01' }),
    endDate: parseCalendarDay({ value: '2026-10-31' }),
  });
  const participationIds: string[] = [];

  interface ServeInput {
    title: string;
    start: [string, string];
    end: [string, string];
    status?: 'scheduled' | 'cancelled';
    isHidden?: boolean;
    blocks: BlockSpec[];
  }
  interface BlockSpec {
    label?: string;
    start: [string, string];
    end: [string, string];
    served?: boolean;
    status?: 'active' | 'cancelled';
    isHidden?: boolean;
    shifts?: ShiftSpec[];
  }
  interface ShiftSpec {
    label?: string;
    start: [string, string];
    end: [string, string];
    places: PlaceSpec[];
  }
  interface PlaceSpec {
    sectorId: string;
    roleId: string;
    peopleNeeded: number;
    assigned: [string, 'draft' | 'pending' | 'cancelled'][];
  }

  /** One Kids-served Event with its blocks, Shifts and Assignments. */
  async function serve(spec: ServeInput) {
    const created = await buildEvent({
      db,
      churchId,
      cycleId: october.id,
      title: spec.title,
      start: local(...spec.start),
      end: local(...spec.end),
      status: spec.status ?? 'scheduled',
    });
    if (spec.isHidden) {
      await db
        .update(event)
        .set({ isHidden: true })
        .where(eq(event.id, created.id));
    }
    const blocks = [];
    for (const block of spec.blocks) {
      blocks.push(
        await buildEventTimeBlock({
          db,
          churchId,
          eventId: created.id,
          start: local(...block.start),
          end: local(...block.end),
          label: block.label,
          status: block.status,
        }),
      );
    }
    for (const [index, block] of spec.blocks.entries()) {
      if (!block.isHidden) continue;
      await db
        .update(eventTimeBlock)
        .set({ isHidden: true })
        .where(eq(eventTimeBlock.id, blocks[index]?.id as string));
    }
    const participation = await buildMinistryParticipation({
      db,
      churchId,
      ministryId: kids.id,
      eventId: created.id,
      state: 'published',
      eventTimeBlockIds: blocks
        .filter((_, index) => spec.blocks[index]?.served !== false)
        .map((block) => block.id),
    });
    participationIds.push(participation.id);
    for (const [index, block] of spec.blocks.entries()) {
      for (const shiftSpec of block.shifts ?? []) {
        const shiftRow = await buildShift({
          db,
          churchId,
          participationId: participation.id,
          eventTimeBlockId: blocks[index]?.id as string,
          start: local(...shiftSpec.start),
          end: local(...shiftSpec.end),
          label: shiftSpec.label ?? null,
        });
        for (const place of shiftSpec.places) {
          const requirement = await buildShiftRequirement({
            db,
            churchId,
            participationId: participation.id,
            shiftId: shiftRow.id,
            roleId: place.roleId,
            sectorId: place.sectorId,
            peopleNeeded: place.peopleNeeded,
          });
          for (const [name, status] of place.assigned) {
            await buildAssignment({
              db,
              churchId,
              participationId: participation.id,
              shiftId: shiftRow.id,
              volunteerId: people[name] as string,
              roleId: place.roleId,
              shiftRequirementId: requirement.id,
              status,
            });
          }
        }
      }
    }
    return { event: created, blocks };
  }

  // Created before the 4th: the order comes from the read, not insertion.
  await serve({
    title: 'Culto de Quarta',
    start: ['2026-10-07', '19:30'],
    end: ['2026-10-07', '21:00'],
    blocks: [
      {
        start: ['2026-10-07', '19:30'],
        end: ['2026-10-07', '21:00'],
        shifts: [
          {
            start: ['2026-10-07', '19:30'],
            end: ['2026-10-07', '21:00'],
            places: [
              {
                sectorId: maternal.id,
                roleId: professor.id,
                peopleNeeded: 1,
                assigned: [['Bruno Lima', 'pending']],
              },
            ],
          },
        ],
      },
    ],
  });
  await serve({
    title: 'Culto da Família',
    start: ['2026-10-04', '08:00'],
    end: ['2026-10-04', '12:00'],
    blocks: [
      {
        label: 'Ensaio',
        start: ['2026-10-04', '08:00'],
        end: ['2026-10-04', '09:00'],
        served: false,
      },
      {
        label: 'Manhã',
        start: ['2026-10-04', '09:00'],
        end: ['2026-10-04', '12:00'],
        shifts: [
          {
            label: 'Turno 2',
            start: ['2026-10-04', '10:30'],
            end: ['2026-10-04', '12:00'],
            places: [
              {
                sectorId: bercario.id,
                roleId: professor.id,
                peopleNeeded: 1,
                assigned: [['Ána  Souza', 'draft']],
              },
            ],
          },
          {
            label: 'Turno 1',
            start: ['2026-10-04', '09:00'],
            end: ['2026-10-04', '10:30'],
            places: [
              {
                sectorId: maternal.id,
                roleId: professor.id,
                peopleNeeded: 1,
                assigned: [['Bruno Lima', 'pending']],
              },
              {
                sectorId: bercario.id,
                roleId: professor.id,
                peopleNeeded: 1,
                assigned: [['Carla Dias', 'pending']],
              },
              {
                sectorId: bercario.id,
                roleId: auxiliar.id,
                peopleNeeded: 2,
                assigned: [
                  ['Davi Rocha', 'cancelled'],
                  ['Ana Souza', 'pending'],
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  const cancelledSunday = await serve({
    title: 'Culto da Família',
    start: ['2026-10-11', '09:00'],
    end: ['2026-10-11', '12:00'],
    status: 'cancelled',
    blocks: [
      {
        label: 'Manhã',
        start: ['2026-10-11', '09:00'],
        end: ['2026-10-11', '12:00'],
        shifts: [
          {
            start: ['2026-10-11', '09:00'],
            end: ['2026-10-11', '12:00'],
            places: [
              {
                sectorId: maternal.id,
                roleId: professor.id,
                peopleNeeded: 1,
                assigned: [['Bruno Lima', 'pending']],
              },
            ],
          },
        ],
      },
    ],
  });
  const hiddenSunday = await serve({
    title: 'Culto da Família',
    start: ['2026-10-18', '09:00'],
    end: ['2026-10-18', '12:00'],
    status: 'cancelled',
    isHidden: true,
    blocks: [
      {
        label: 'Manhã',
        start: ['2026-10-18', '09:00'],
        end: ['2026-10-18', '12:00'],
      },
    ],
  });
  const wednesday = await serve({
    title: 'Culto de Quarta',
    start: ['2026-10-14', '19:30'],
    end: ['2026-10-14', '21:00'],
    blocks: [
      {
        label: 'Louvor',
        start: ['2026-10-14', '19:30'],
        end: ['2026-10-14', '20:00'],
        status: 'cancelled',
      },
      {
        label: 'Palavra',
        start: ['2026-10-14', '20:00'],
        end: ['2026-10-14', '21:00'],
        status: 'cancelled',
        isHidden: true,
      },
    ],
  });
  await serve({
    title: 'Retiro',
    start: ['2026-10-24', '08:00'],
    end: ['2026-10-25', '18:00'],
    blocks: [
      {
        label: 'Retiro',
        start: ['2026-10-24', '08:00'],
        end: ['2026-10-25', '18:00'],
        shifts: ['2026-10-25', '2026-10-24'].map((day) => ({
          start: [day, '08:00'] as [string, string],
          end: [day, '12:00'] as [string, string],
          places: [
            {
              sectorId: bercario.id,
              roleId: professor.id,
              peopleNeeded: 1,
              assigned: [['Carla Dias', 'pending']] as PlaceSpec['assigned'],
            },
          ],
        })),
      },
    ],
  });
  // Worship serves this one; Kids does not.
  const rehearsal = await buildEvent({
    db,
    churchId,
    cycleId: october.id,
    title: 'Ensaio Geral',
    start: local('2026-10-20', '19:00'),
    end: local('2026-10-20', '21:00'),
    status: 'scheduled',
  });
  await buildMinistryParticipation({
    db,
    churchId,
    ministryId: worship.id,
    eventId: rehearsal.id,
    state: 'published',
    eventTimeBlockIds: [],
  });

  // One Event, one Sector, one Role.
  const november = await buildCycle({
    db,
    churchId,
    name: 'Novembro 2026',
    state: 'sent',
    startDate: parseCalendarDay({ value: '2026-11-01' }),
    endDate: parseCalendarDay({ value: '2026-11-30' }),
  });
  const novemberSunday = await buildEvent({
    db,
    churchId,
    cycleId: november.id,
    title: 'Culto da Família',
    start: local('2026-11-01', '09:00'),
    end: local('2026-11-01', '12:00'),
    status: 'scheduled',
  });
  const novemberBlock = await buildEventTimeBlock({
    db,
    churchId,
    eventId: novemberSunday.id,
    start: local('2026-11-01', '09:00'),
    end: local('2026-11-01', '12:00'),
    label: 'Culto da Família',
  });
  const novemberParticipation = await buildMinistryParticipation({
    db,
    churchId,
    ministryId: kids.id,
    eventId: novemberSunday.id,
    state: 'published',
    eventTimeBlockIds: [novemberBlock.id],
  });
  const novemberShift = await buildShift({
    db,
    churchId,
    participationId: novemberParticipation.id,
    eventTimeBlockId: novemberBlock.id,
    start: local('2026-11-01', '09:00'),
    end: local('2026-11-01', '12:00'),
  });
  const novemberPlace = await buildShiftRequirement({
    db,
    churchId,
    participationId: novemberParticipation.id,
    shiftId: novemberShift.id,
    roleId: professor.id,
    sectorId: bercario.id,
    peopleNeeded: 1,
  });
  await buildAssignment({
    db,
    churchId,
    participationId: novemberParticipation.id,
    shiftId: novemberShift.id,
    volunteerId: people['Carla Dias'] as string,
    roleId: professor.id,
    shiftRequirementId: novemberPlace.id,
    status: 'pending',
  });

  // No Kids Schedule in December.
  const december = await buildCycle({
    db,
    churchId,
    name: 'Dezembro 2026',
    state: 'draft',
    startDate: parseCalendarDay({ value: '2026-12-01' }),
    endDate: parseCalendarDay({ value: '2026-12-31' }),
  });
  const foreignCycle = await buildCycle({
    db,
    churchId: EXPORT_CHURCH_B,
    name: 'Foreign October',
    state: 'sent',
    startDate: parseCalendarDay({ value: '2026-10-01' }),
    endDate: parseCalendarDay({ value: '2026-10-31' }),
  });

  return {
    kidsId: kids.id,
    worshipId: worship.id,
    foreignMinistryId: foreign.id,
    octoberId: october.id,
    novemberId: november.id,
    decemberId: december.id,
    foreignCycleId: foreignCycle.id,
    participationIds,
    cancelledSundayId: cancelledSunday.event.id,
    hiddenSundayId: hiddenSunday.event.id,
    hiddenBlockId: wednesday.blocks[1]?.id as string,
    personas: {
      admin: await persona({ key: 'admin', churchAccess: 'admin' }),
      leader: await persona({
        key: 'leader',
        churchAccess: 'member',
        membership: { ministryId: kids.id, level: 'leader' },
      }),
      otherLeader: await persona({
        key: 'otherLeader',
        churchAccess: 'member',
        membership: { ministryId: worship.id, level: 'leader' },
      }),
      volunteer: await persona({
        key: 'volunteer',
        churchAccess: 'member',
        membership: { ministryId: kids.id, level: 'volunteer' },
      }),
      member: await persona({ key: 'member', churchAccess: 'member' }),
    } satisfies Record<ExportPersona, PersonaRecord>,
  };
}

export type ScheduleExportFixture = Awaited<
  ReturnType<typeof seedScheduleExport>
>;

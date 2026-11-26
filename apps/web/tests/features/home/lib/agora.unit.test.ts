import { describe, expect, it } from 'vitest';
import { deriveAgora } from '@/features/home/lib/agora';

const churchDay = '2026-11-24';

function check(id: string, answerBy?: string | null) {
  return { id, ministryName: 'Kids', cycleName: 'Janeiro', answerBy };
}

const focus = {
  cycleId: 'c-jan',
  name: 'Janeiro',
  ministries: [
    { ministryId: 'm-kids', name: 'Kids', needed: 168, filled: 0 },
    { ministryId: 'm-park', name: 'Estacionamento', needed: 72, filled: 0 },
  ],
};

/** Every rung present at once; each test removes the ones above it. */
const all = {
  churchDay,
  checks: [check('late', '2026-11-20T00:00:00Z'), check('soon', '2026-11-30')],
  setupDone: false,
  focus,
  focusAvailability: { asked: 50, answered: 38 },
  withoutMinistry: 3,
};

describe('deriveAgora', () => {
  it('is calm when no held source needs anything', () => {
    expect(deriveAgora({ churchDay })).toEqual({ kind: 'calm' });
  });

  it('puts an overdue availability answer first', () => {
    expect(deriveAgora(all)).toEqual({
      kind: 'check-overdue',
      check: check('late', '2026-11-20T00:00:00Z'),
    });
  });

  it('then unfinished Church setup', () => {
    expect(
      deriveAgora({ ...all, checks: [check('soon', '2026-11-30')] }),
    ).toEqual({
      kind: 'setup',
    });
  });

  it('then the Ministry with the most open spots in the focus Cycle', () => {
    expect(
      deriveAgora({
        ...all,
        checks: [check('soon', '2026-11-30')],
        setupDone: true,
      }),
    ).toEqual({
      kind: 'coverage-gap',
      ministryId: 'm-kids',
      ministryName: 'Kids',
      cycleId: 'c-jan',
      cycleName: 'Janeiro',
      open: 168,
    });
  });

  it('then availability still unanswered in the focus Cycle', () => {
    const covered = {
      ...focus,
      ministries: [{ ministryId: 'm', name: 'Kids', needed: 4, filled: 4 }],
    };
    expect(
      deriveAgora({
        ...all,
        checks: [check('soon', '2026-11-30')],
        setupDone: true,
        focus: covered,
      }),
    ).toEqual({ kind: 'unanswered', cycleName: 'Janeiro', count: 12 });
  });

  it('then the caller’s own pending answer, earliest deadline first and undated last', () => {
    expect(
      deriveAgora({
        churchDay,
        checks: [
          check('undated', null),
          check('later', '2026-12-10'),
          check('soon', '2026-11-30'),
        ],
        withoutMinistry: 3,
      }),
    ).toEqual({ kind: 'check-pending', check: check('soon', '2026-11-30') });
  });

  it('then people without a Ministry', () => {
    expect(deriveAgora({ churchDay, checks: [], withoutMinistry: 3 })).toEqual({
      kind: 'people-without-ministry',
      count: 3,
    });
  });

  it('keeps an answer due today as pending, not overdue', () => {
    expect(
      deriveAgora({
        churchDay,
        checks: [check('today', '2026-11-24T23:00:00Z')],
      }),
    ).toEqual({
      kind: 'check-pending',
      check: check('today', '2026-11-24T23:00:00Z'),
    });
  });

  it('keeps server order between Ministries with the same gap', () => {
    const tied = {
      ...focus,
      ministries: [
        { ministryId: 'a', name: 'A', needed: 5, filled: 0 },
        { ministryId: 'b', name: 'B', needed: 5, filled: 0 },
      ],
    };
    expect(deriveAgora({ churchDay, focus: tied })).toMatchObject({
      ministryId: 'a',
    });
  });
});

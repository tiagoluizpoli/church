import { describe, expect, it } from 'vitest';
import { EventTemplate } from '../../../src/domain/entities/event-template';
import {
  TimeBlock,
  type TimeBlockProps,
} from '../../../src/domain/entities/time-block';
import { InvalidTimeRangeError } from '../../../src/domain/errors/invalid-time-range';
import { InvalidWeekdayError } from '../../../src/domain/errors/invalid-weekday';

interface CreateTimeBlockInput {
  props?: Partial<TimeBlockProps>;
  id?: string;
}

function createTimeBlock({ props, id }: CreateTimeBlockInput = {}) {
  return new TimeBlock({
    props: {
      churchId: '11111111-1111-1111-1111-111111111111',
      templateId: '22222222-2222-2222-2222-222222222222',
      label: 'Welcome',
      startTime: '09:00',
      endTime: '09:30',
      order: 2,
      ...props,
    },
    id,
  });
}

describe('EventTemplate and TimeBlock', () => {
  it('keeps blocks ordered for a valid weekday template', () => {
    const template = new EventTemplate({
      props: {
        churchId: '11111111-1111-1111-1111-111111111111',
        name: 'Sunday Service',
        weekday: 0,
        blocks: [
          createTimeBlock(),
          createTimeBlock({
            props: {
              label: 'Gathering',
              startTime: '08:30',
              endTime: '09:00',
              order: 1,
            },
            id: '33333333-3333-3333-3333-333333333331',
          }),
        ],
      },
      id: '22222222-2222-2222-2222-222222222222',
    });

    expect(template.churchId).toBe('11111111-1111-1111-1111-111111111111');
    expect(template.name).toBe('Sunday Service');
    expect(template.weekday).toBe(0);
    expect(template.blocks.map((block) => block.order)).toEqual([1, 2]);
  });

  it('rejects time blocks whose start is not before the end', () => {
    expect(() =>
      createTimeBlock({
        props: {
          startTime: '10:00',
          endTime: '10:00',
        },
      }),
    ).toThrow(InvalidTimeRangeError);
  });

  it('supports a single time block template', () => {
    const block = createTimeBlock({
      props: {
        order: 1,
      },
      id: '33333333-3333-3333-3333-333333333332',
    });

    const template = new EventTemplate({
      props: {
        churchId: '11111111-1111-1111-1111-111111111111',
        name: 'Wednesday Prayer',
        weekday: 3,
        blocks: [block],
      },
    });

    expect(template.blocks).toHaveLength(1);
    expect(template.blocks[0]?.id).toBe('33333333-3333-3333-3333-333333333332');
  });

  it('rejects weekdays outside the 0..6 range', () => {
    expect(
      () =>
        new EventTemplate({
          props: {
            churchId: '11111111-1111-1111-1111-111111111111',
            name: 'Broken',
            weekday: 7,
            blocks: [],
          },
        }),
    ).toThrow(InvalidWeekdayError);

    expect(
      () =>
        new EventTemplate({
          props: {
            churchId: '11111111-1111-1111-1111-111111111111',
            name: 'Broken',
            weekday: -1,
            blocks: [],
          },
        }),
    ).toThrow(InvalidWeekdayError);
  });

  it('preserves stable block ids for later slot generation', () => {
    const block = createTimeBlock({
      props: {
        order: 1,
      },
      id: '33333333-3333-3333-3333-333333333333',
    });

    expect(block.id).toBe('33333333-3333-3333-3333-333333333333');
  });

  it('exposes every TimeBlock property', () => {
    const block = createTimeBlock({
      props: {
        label: 'Gathering',
        startTime: '08:30',
        endTime: '09:00',
        order: 1,
      },
      id: '33333333-3333-3333-3333-333333333334',
    });

    expect(block.churchId).toBe('11111111-1111-1111-1111-111111111111');
    expect(block.templateId).toBe('22222222-2222-2222-2222-222222222222');
    expect(block.label).toBe('Gathering');
    expect(block.startTime).toBe('08:30');
    expect(block.endTime).toBe('09:00');
    expect(block.order).toBe(1);
  });
});

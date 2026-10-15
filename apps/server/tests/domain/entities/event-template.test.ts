import { parseTimeOfDay } from '@church/time';
import { describe, expect, it } from 'vitest';
import { EventTemplate } from '@/domain/entities/event-template';
import {
  TemplateTimeBlock,
  type TemplateTimeBlockProps,
} from '@/domain/entities/template-time-block';
import { InvalidTimeRangeError } from '@/domain/errors/invalid-time-range';
import { InvalidWeekdayError } from '@/domain/errors/invalid-weekday';

interface CreateTemplateTimeBlockInput {
  props?: Partial<TemplateTimeBlockProps>;
  id?: string;
}

function createTemplateTimeBlock({
  props,
  id,
}: CreateTemplateTimeBlockInput = {}) {
  return new TemplateTimeBlock({
    props: {
      churchId: '11111111-1111-1111-1111-111111111111',
      templateId: '22222222-2222-2222-2222-222222222222',
      label: 'Welcome',
      startTime: parseTimeOfDay({ value: '09:00' }),
      endTime: parseTimeOfDay({ value: '09:30' }),
      order: 2,
      ...props,
    },
    id,
  });
}

describe('EventTemplate and TemplateTimeBlock', () => {
  it('keeps blocks ordered for a valid weekday template', () => {
    const template = new EventTemplate({
      props: {
        churchId: '11111111-1111-1111-1111-111111111111',
        name: 'Sunday Service',
        weekday: 0,
        blocks: [
          createTemplateTimeBlock(),
          createTemplateTimeBlock({
            props: {
              label: 'Gathering',
              startTime: parseTimeOfDay({ value: '08:30' }),
              endTime: parseTimeOfDay({ value: '09:00' }),
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

  it('rejects zero-length time blocks (equal start and end)', () => {
    expect(() =>
      createTemplateTimeBlock({
        props: {
          startTime: parseTimeOfDay({ value: '10:00' }),
          endTime: parseTimeOfDay({ value: '10:00' }),
        },
      }),
    ).toThrow(InvalidTimeRangeError);
  });

  it('accepts an overnight time block whose end is before its start', () => {
    const block = createTemplateTimeBlock({
      props: {
        startTime: parseTimeOfDay({ value: '22:00' }),
        endTime: parseTimeOfDay({ value: '02:00' }),
      },
    });

    expect(block.startTime).toBe('22:00');
    expect(block.endTime).toBe('02:00');
  });

  it('supports a single time block template', () => {
    const block = createTemplateTimeBlock({
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

  it('preserves stable block ids for later event time block generation', () => {
    const block = createTemplateTimeBlock({
      props: {
        order: 1,
      },
      id: '33333333-3333-3333-3333-333333333333',
    });

    expect(block.id).toBe('33333333-3333-3333-3333-333333333333');
  });

  it('exposes every TemplateTimeBlock property', () => {
    const block = createTemplateTimeBlock({
      props: {
        label: 'Gathering',
        startTime: parseTimeOfDay({ value: '08:30' }),
        endTime: parseTimeOfDay({ value: '09:00' }),
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

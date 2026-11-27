import { parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import { EventTimeBlock } from '@/domain/entities/event-time-block';
import { IllegalStateTransitionError } from '@/domain/errors/illegal-state-transition';
import { InvalidDateRangeError } from '@/domain/errors/invalid-date-range';

describe('EventTimeBlock Entity', () => {
  it('constructs with valid props', () => {
    const startTime = parseInstant({ value: '2026-05-15T10:00:00Z' });
    const endTime = parseInstant({ value: '2026-05-15T12:00:00Z' });

    const eventTimeBlock = new EventTimeBlock({
      props: {
        churchId: 'c1',
        eventId: 'e1',
        sourceTemplateTimeBlockId: 'tb1',
        startTime,
        endTime,
        label: 'Morning Event time block',
      },
    });

    expect(eventTimeBlock.churchId).toBe('c1');
    expect(eventTimeBlock.eventId).toBe('e1');
    expect(eventTimeBlock.sourceTemplateTimeBlockId).toBe('tb1');
    expect(eventTimeBlock.label).toBe('Morning Event time block');
    expect(eventTimeBlock.startTime).toBe(startTime);
    expect(eventTimeBlock.endTime).toBe(endTime);
    expect(eventTimeBlock.status).toBe('active');
  });

  it('handles mutations correctly', () => {
    const startTime = parseInstant({ value: '2026-05-15T10:00:00Z' });
    const endTime = parseInstant({ value: '2026-05-15T12:00:00Z' });

    const eventTimeBlock = new EventTimeBlock({
      props: {
        churchId: 'c1',
        eventId: 'e1',
        startTime,
        endTime,
      },
    });

    expect(eventTimeBlock.status).toBe('active');

    eventTimeBlock.cancel();
    expect(eventTimeBlock.status).toBe('cancelled');
  });

  it('throws InvalidDateRangeError if startTime >= endTime', () => {
    const startTime = parseInstant({ value: '2026-05-15T12:00:00Z' });
    const endTime = parseInstant({ value: '2026-05-15T10:00:00Z' });

    expect(() => {
      new EventTimeBlock({
        props: {
          churchId: 'c1',
          eventId: 'e1',
          startTime,
          endTime,
        },
      });
    }).toThrow(InvalidDateRangeError);
  });
});

describe('EventTimeBlock hide/show', () => {
  const props = {
    churchId: 'c1',
    eventId: 'e1',
    startTime: parseInstant({ value: '2026-05-15T10:00:00Z' }),
    endTime: parseInstant({ value: '2026-05-15T12:00:00Z' }),
  };

  it('hides and shows a cancelled block', () => {
    const block = new EventTimeBlock({ props });
    block.cancel();

    block.hide();
    expect(block.isHidden).toBe(true);
    block.show();
    expect(block.isHidden).toBe(false);
  });

  it('refuses to hide or show an active block', () => {
    const block = new EventTimeBlock({ props });

    expect(() => block.hide()).toThrow(
      new IllegalStateTransitionError({ from: 'active', to: 'hide' }),
    );
    expect(() => block.show()).toThrow(
      new IllegalStateTransitionError({ from: 'active', to: 'show' }),
    );
    expect(block.isHidden).toBe(false);
  });
});

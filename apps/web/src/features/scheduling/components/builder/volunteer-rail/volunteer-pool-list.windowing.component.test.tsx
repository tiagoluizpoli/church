import { DndContext } from '@dnd-kit/core';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PoolVolunteer } from '../../../hooks/use-volunteer-pool';
import { VolunteerPoolSidebar } from './volunteer-pool-sidebar';

// jsdom has no layout, so the virtualizer measures a zero-height viewport and
// renders nothing. @tanstack/react-virtual sizes the scroll viewport from
// `offsetHeight` and each row from `getBoundingClientRect`, so those are the two
// measurements the windowing needs. Both are stubbed on the prototype and
// restored after each test, keeping the rest of the suite layout-free.
const originalOffsetHeight = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'offsetHeight',
);

const VIEWPORT_HEIGHT = 600;
const ROW_HEIGHT = 96;

function stubLayout() {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute('data-slot') === 'scroll-area-viewport'
        ? VIEWPORT_HEIGHT
        : 0;
    },
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        width: 320,
        height: ROW_HEIGHT,
        top: 0,
        left: 0,
        right: 320,
        bottom: ROW_HEIGHT,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect,
  );
}

const volunteers: PoolVolunteer[] = Array.from({ length: 120 }, (_, index) => ({
  volunteerId: String(index),
  volunteerName: `Person ${String(index).padStart(3, '0')}`,
  status: 'available',
}));

const roles = [{ id: 'usher', name: 'Usher' }];

function Rail() {
  return (
    <DndContext>
      <VolunteerPoolSidebar
        volunteers={volunteers}
        assignments={[]}
        roles={roles}
      />
    </DndContext>
  );
}

describe('VolunteerPoolList windowing (B-6.b)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (originalOffsetHeight) {
      Object.defineProperty(
        HTMLElement.prototype,
        'offsetHeight',
        originalOffsetHeight,
      );
    }
  });

  it('mounts only a window of cards for a long rail instead of all of them', () => {
    stubLayout();

    // The sidebar hands the viewport to the list through a state-backed
    // callback ref, so attaching it re-renders and the virtualizer measures the
    // real element — no manual second render needed.
    render(<Rail />);

    const mounted = screen.getAllByTestId('volunteer-card');
    // A 600px viewport over 96px rows plus overscan is a couple dozen cards —
    // far fewer than the 120 an unvirtualized rail would mount, which is the
    // whole point of the ticket: each mounted card is a live dnd-kit draggable.
    expect(mounted.length).toBeGreaterThan(0);
    expect(mounted.length).toBeLessThan(volunteers.length);
  });
});

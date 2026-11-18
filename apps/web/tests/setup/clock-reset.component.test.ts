import { now, parseInstant, setTestClock } from '@church/time';
import { describe, expect, it } from 'vitest';

// Guards that the component project's own `setupFiles` add to the root clock
// setup rather than replacing it. Order-dependent on purpose: the first test
// pins the clock and never releases it, so the second passes only if the
// global `afterEach(resetClock)` ran in between.
const pinned = parseInstant({ value: '2001-02-03T04:05:06.000Z' });

describe('global clock reset in the component project', () => {
  it('pins the clock and leaves it pinned', () => {
    setTestClock({ instant: pinned });
    expect(now()).toBe(pinned);
  });

  it('starts the next test on the real clock', () => {
    expect(now()).not.toBe(pinned);
  });
});

import { resetClock } from '@church/time';
import { afterEach } from 'vitest';

// Shared by every web test project. Safety net: a test that pins `now()` with
// `setTestClock` and forgets to release it must not leak into the next test.
afterEach(() => {
  resetClock();
});

import { resetClock } from '@church/time/now';
import { afterEach } from 'vitest';

// Imports the leaf module, not the barrel: the barrel loads date-fns and zod
// for every test file. Shared by every web test project. Safety net: a test that pins `now()` with
// `setTestClock` and forgets to release it must not leak into the next test.
afterEach(() => {
  resetClock();
});

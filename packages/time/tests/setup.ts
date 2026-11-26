import { afterEach } from 'vitest';
import { resetClock } from '@/index';

// Safety net: a test that forgets to reset its fixed clock must not leak it.
afterEach(() => {
  resetClock();
});

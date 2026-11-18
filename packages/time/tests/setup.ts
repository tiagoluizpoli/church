import { afterEach } from 'vitest';
import { resetClock } from '../src';

// Safety net: a test that forgets to reset its fixed clock must not leak it.
afterEach(() => {
  resetClock();
});

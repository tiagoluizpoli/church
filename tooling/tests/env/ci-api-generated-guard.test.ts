import { describe, expect, it } from 'bun:test';
import { workflow } from './ci-workflow';

/** #576 / #553: the gate jobs regenerate the API client and fail on drift. */
describe('CI generated API guard', () => {
  for (const name of ['develop-fast', 'fast-gate']) {
    it(`${name} runs validate:api-generated`, () => {
      const steps = workflow.jobs[name]?.steps ?? [];

      expect(
        steps.some((step) => step.run?.includes('validate:api-generated')),
      ).toBe(true);
    });
  }
});

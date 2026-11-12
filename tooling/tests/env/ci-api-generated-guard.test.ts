import { describe, expect, it } from 'bun:test';
import { workflow } from './ci-workflow';

/** #576 / #553 / #859: the gate jobs regenerate the API client and fail on drift. */
describe('CI generated API guard', () => {
  for (const name of ['develop-fast', 'fast-gate', 'release-gate']) {
    it(`${name} runs validate:api-generated`, () => {
      const steps = workflow.jobs[name]?.steps ?? [];

      expect(
        steps.some((step) => step.run?.includes('validate:api-generated')),
      ).toBe(true);
    });
  }

  it('release-gate runs it after shared setup and before lint', () => {
    const steps = workflow.jobs['release-gate']?.steps ?? [];
    const indexOf = (match: (step: (typeof steps)[number]) => boolean) =>
      steps.findIndex(match);
    const guard = indexOf((s) => !!s.run?.includes('validate:api-generated'));

    expect(guard).toBeGreaterThan(indexOf((s) => s.id === 'setup'));
    expect(guard).toBeLessThan(indexOf((s) => s.run === 'bun run lint'));
  });
});

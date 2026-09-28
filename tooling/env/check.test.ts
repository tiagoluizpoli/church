import { describe, expect, it } from 'bun:test';
import { parseArgs } from './check';

describe('parseArgs', () => {
  it('defaults to the development purpose and every service when given no args', () => {
    expect(parseArgs({ argv: [] })).toEqual({
      purpose: 'development',
      labels: undefined,
    });
  });

  it('reads the purpose as the first positional argument', () => {
    expect(parseArgs({ argv: ['integration'] })).toEqual({
      purpose: 'integration',
      labels: undefined,
    });
  });

  it('reads --services= as a comma-separated allowlist of service labels', () => {
    expect(
      parseArgs({ argv: ['integration', '--services=db,auth,server'] }),
    ).toEqual({
      purpose: 'integration',
      labels: ['db', 'auth', 'server'],
    });
  });
});

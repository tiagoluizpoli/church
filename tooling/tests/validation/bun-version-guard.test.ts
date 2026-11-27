import { describe, expect, it } from 'bun:test';
import {
  getBunVersionFailures,
  readBunPinFiles,
} from '../../validation/bun-version-guard';

const MISE_TOML = '[tools]\nbun = "1.4.3"\nnode = "26.11.1"\n';

describe('Bun version guard', () => {
  it('accepts the same Bun in both files', () => {
    expect(
      getBunVersionFailures({
        miseToml: MISE_TOML,
        packageJson: '{"packageManager":"bun@1.4.3"}',
      }),
    ).toEqual([]);
  });

  it('rejects a packageManager that names another Bun', () => {
    expect(
      getBunVersionFailures({
        miseToml: MISE_TOML,
        packageJson: '{"packageManager":"bun@1.4.2"}',
      }),
    ).toEqual([
      'package.json: packageManager is "bun@1.4.2", but mise.toml pins bun "1.4.3": make it "bun@1.4.3"',
    ]);
  });

  it('rejects a missing packageManager', () => {
    expect(
      getBunVersionFailures({ miseToml: MISE_TOML, packageJson: '{}' }),
    ).toEqual([
      'package.json: packageManager is missing, but mise.toml pins bun "1.4.3": make it "bun@1.4.3"',
    ]);
  });

  it('rejects a mise.toml without a Bun pin', () => {
    expect(
      getBunVersionFailures({
        miseToml: '[tools]\nnode = "26.11.1"\n',
        packageJson: '{"packageManager":"bun@1.4.3"}',
      }),
    ).toEqual(['mise.toml: [tools] has no bun version string']);
  });

  it('keeps the repository pins in step', () => {
    expect(getBunVersionFailures(readBunPinFiles())).toEqual([]);
  });
});

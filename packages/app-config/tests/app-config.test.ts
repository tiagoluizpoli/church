import { describe, expect, it } from 'vitest';
import { appConfig, withAllParkedOn } from '../src';

describe('appConfig', () => {
  it('ships with every parked switch off', () => {
    expect(Object.values(appConfig.parked).every((on) => on === false)).toBe(
      true,
    );
  });
});

describe('withAllParkedOn', () => {
  it('turns every parked switch on and leaves other values untouched', () => {
    const result = withAllParkedOn(appConfig);
    expect(Object.values(result.parked).every((on) => on === true)).toBe(true);
    expect(Object.keys(result.parked)).toEqual(Object.keys(appConfig.parked));
    expect({ ...result, parked: null }).toEqual({ ...appConfig, parked: null });
    expect(appConfig.parked.auditPanel).toBe(false);
  });
});

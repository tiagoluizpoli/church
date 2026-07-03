import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHURCH_ADMIN_STORAGE_STATE,
  LEADER_STORAGE_STATE,
  VOLUNTEER_STORAGE_STATE,
} from '../../src/test-support/e2e-seed';

describe('scheduling E2E storage states', () => {
  it('defines distinct per-role Playwright state files', () => {
    expect([
      CHURCH_ADMIN_STORAGE_STATE,
      LEADER_STORAGE_STATE,
      VOLUNTEER_STORAGE_STATE,
    ]).toEqual([
      expect.stringContaining(path.join('tests', '.auth', 'church-admin.json')),
      expect.stringContaining(path.join('tests', '.auth', 'leader.json')),
      expect.stringContaining(path.join('tests', '.auth', 'volunteer.json')),
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { CALL_SITE_IDS, yearSlice } from './planning-cycle-year.helpers';

const BAND_START = 2100;
const BAND_SIZE = 50;

describe('yearSlice', () => {
  it('gives a single worker the full band', () => {
    CALL_SITE_IDS.forEach((callSiteId, index) => {
      expect(yearSlice({ callSiteId, parallelIndex: 0, workers: 1 })).toEqual({
        start: BAND_START + index * BAND_SIZE,
        size: BAND_SIZE,
      });
    });
  });

  it.each([
    1, 2, 3, 4,
  ])('keeps slices disjoint and inside the band for %i workers', (workers) => {
    CALL_SITE_IDS.forEach((callSiteId, index) => {
      const bandStart = BAND_START + index * BAND_SIZE;
      let previousEnd = bandStart;
      for (let parallelIndex = 0; parallelIndex < workers; parallelIndex++) {
        const { start, size } = yearSlice({
          callSiteId,
          parallelIndex,
          workers,
        });
        expect(size).toBeGreaterThan(0);
        expect(start).toBeGreaterThanOrEqual(previousEnd);
        previousEnd = start + size;
      }
      expect(previousEnd).toBeLessThanOrEqual(bandStart + BAND_SIZE);
    });
  });
});

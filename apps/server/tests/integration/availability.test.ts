import { describe, expect, it } from 'vitest';
import { AvailabilityService } from '../../src/domain/services/availability-service';

describe('AvailabilityService - DST Boundaries', () => {
  // Scenario: London Spring Forward (March 31, 2024)
  // At 01:00 UTC, time jumps to 02:00 BST.
  describe('Spring Forward (London 2024)', () => {
    it('should correctly identify overlap across the shift boundary', () => {
      const slot = {
        start: new Date('2024-03-31T00:30:00Z'), // 00:30 UTC
        end: new Date('2024-03-31T02:30:00Z'), // 02:30 UTC (03:30 BST)
      };

      const unavailabilities = [
        {
          start: new Date('2024-03-31T01:15:00Z'), // During the "skipped" hour if local
          end: new Date('2024-03-31T01:45:00Z'),
        },
      ];

      // Since we use UTC (Zulu), the comparison is strictly linear/absolute
      expect(AvailabilityService.isUnavailable(slot, unavailabilities)).toBe(
        true,
      );
    });

    it('should NOT identify overlap if intervals are distinct in UTC', () => {
      const slot = {
        start: new Date('2024-03-31T00:00:00Z'),
        end: new Date('2024-03-31T01:00:00Z'),
      };

      const unavailabilities = [
        {
          start: new Date('2024-03-31T01:00:01Z'),
          end: new Date('2024-03-31T02:00:00Z'),
        },
      ];

      expect(AvailabilityService.isUnavailable(slot, unavailabilities)).toBe(
        false,
      );
    });
  });

  // Scenario: London Fall Back (October 27, 2024)
  // At 02:00 BST, time falls back to 01:00 GMT (double hour).
  describe('Fall Back (London 2024)', () => {
    it('should handle the repeated hour correctly using UTC', () => {
      // 01:30 UTC (First 01:30 local)
      const slot = {
        start: new Date('2024-10-27T01:00:00Z'),
        end: new Date('2024-10-27T02:00:00Z'),
      };

      // 01:30 UTC (Second 01:30 local)
      const unavailabilities = [
        {
          start: new Date('2024-10-27T01:15:00Z'),
          end: new Date('2024-10-27T01:45:00Z'),
        },
      ];

      expect(AvailabilityService.isUnavailable(slot, unavailabilities)).toBe(
        true,
      );
    });
  });

  describe('Positive Availability (isAvailable)', () => {
    it('should return true when slot is fully contained in an availability window', () => {
      const slot = {
        start: new Date('2024-03-31T10:00:00Z'),
        end: new Date('2024-03-31T12:00:00Z'),
      };

      const availabilities = [
        {
          start: new Date('2024-03-31T08:00:00Z'),
          end: new Date('2024-03-31T13:00:00Z'),
        },
      ];

      expect(AvailabilityService.isAvailable(slot, availabilities)).toBe(true);
    });

    it('should return false when slot is partially outside availability windows', () => {
      const slot = {
        start: new Date('2024-03-31T10:00:00Z'),
        end: new Date('2024-03-31T14:00:00Z'),
      };

      const availabilities = [
        {
          start: new Date('2024-03-31T08:00:00Z'),
          end: new Date('2024-03-31T13:00:00Z'),
        },
      ];

      expect(AvailabilityService.isAvailable(slot, availabilities)).toBe(false);
    });
  });
});

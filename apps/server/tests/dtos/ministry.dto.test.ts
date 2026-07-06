import { describe, expect, it } from 'vitest';
import { ministryMapper } from '../../src/api/dtos/ministry.dto';
import { Ministry } from '../../src/domain/entities/ministry';

describe('ministryMapper', () => {
  describe('toResponse', () => {
    it('maps a ministry with description present', () => {
      const ministry = new Ministry(
        {
          churchId: 'c1',
          name: 'Worship',
          description: 'Music team',
          enforcementType: 'hard',
          defaultDirection: 'all_in',
        },
        'm1',
      );

      const response = ministryMapper.toResponse(ministry);

      expect(response).toEqual({
        id: 'm1',
        churchId: 'c1',
        name: 'Worship',
        description: 'Music team',
        enforcementType: 'hard',
        defaultDirection: 'all_in',
        createdAt: ministry.createdAt.toISOString(),
        updatedAt: ministry.updatedAt.toISOString(),
      });
    });

    it('maps a ministry with description absent', () => {
      const ministry = new Ministry(
        {
          churchId: 'c1',
          name: 'Ushers',
        },
        'm2',
      );

      const response = ministryMapper.toResponse(ministry);

      expect(response.description).toBeUndefined();
      expect(response.enforcementType).toBe('soft');
      expect(response.defaultDirection).toBe('all_out');
    });
  });

  describe('toResponseList', () => {
    it('maps a list of ministries', () => {
      const ministry1 = new Ministry({ churchId: 'c1', name: 'Worship' }, 'm1');
      const ministry2 = new Ministry(
        { churchId: 'c1', name: 'Ushers', description: 'Greeters' },
        'm2',
      );

      const response = ministryMapper.toResponseList([ministry1, ministry2]);

      expect(response.ministries).toHaveLength(2);
      expect(response.ministries[0]?.id).toBe('m1');
      expect(response.ministries[1]?.description).toBe('Greeters');
    });

    it('maps an empty list', () => {
      const response = ministryMapper.toResponseList([]);

      expect(response.ministries).toEqual([]);
    });
  });
});

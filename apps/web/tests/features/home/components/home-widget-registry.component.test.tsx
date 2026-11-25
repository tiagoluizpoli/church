import { describe, expect, it } from 'vitest';
import { homeWidgets } from '@/features/home/components/home-widget-registry';
import type { HomeCapacities } from '@/features/home/hooks/use-home-capacities';

function widgets(capacities: Partial<HomeCapacities>) {
  const caps: HomeCapacities = {
    church: false,
    leadership: false,
    serving: false,
    leadershipScope: '',
    ...capacities,
  };
  return homeWidgets
    .filter((widget) => widget.capacity(caps))
    .map((widget) => widget.id);
}

describe('Home widget registry', () => {
  it('selects widgets by additive capacity, attention before statistics', () => {
    expect(widgets({})).toEqual(['notifications']);
    expect(widgets({ serving: true })).toEqual([
      'notifications',
      'serving-actions',
      'serving-history',
    ]);
    expect(widgets({ leadership: true })).toEqual([
      'notifications',
      'leadership',
      'cycle-band',
      'coverage',
      'trend',
    ]);
    expect(widgets({ church: true, leadership: true })).toEqual([
      'notifications',
      'leadership',
      'cycle-band',
      'coverage',
      'trend',
      'admin-summary',
      'setup',
    ]);
    expect(widgets({ church: true, leadership: true, serving: true })).toEqual([
      'notifications',
      'serving-actions',
      'leadership',
      'cycle-band',
      'coverage',
      'trend',
      'serving-history',
      'admin-summary',
      'setup',
    ]);
  });
});

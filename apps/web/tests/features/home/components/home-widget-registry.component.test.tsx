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
  it('selects widgets by additive capacity', () => {
    expect(widgets({})).toEqual(['notifications']);
    expect(widgets({ serving: true })).toEqual([
      'notifications',
      'serving-actions',
      'upcoming-assignments',
    ]);
    expect(widgets({ leadership: true })).toEqual([
      'notifications',
      'schedule-summary',
      'leadership',
    ]);
    expect(widgets({ church: true, leadership: true })).toEqual([
      'notifications',
      'schedule-summary',
      'admin-summary',
      'cycles',
      'setup',
      'leadership',
    ]);
    expect(
      widgets({ church: true, leadership: true, serving: true }).slice(1, 4),
    ).toEqual(['serving-actions', 'upcoming-assignments', 'schedule-summary']);
  });
});

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

interface SpanOfInput {
  id: string;
  capacities: Partial<HomeCapacities>;
}

describe('Home widget registry', () => {
  it('selects widgets by additive capacity', () => {
    expect(widgets({})).toEqual(['notifications']);
    expect(widgets({ serving: true })).toEqual([
      'notifications',
      'serving-actions',
    ]);
    expect(widgets({ leadership: true })).toEqual([
      'notifications',
      'schedule-summary',
      'coverage',
      'trend',
      'leadership',
    ]);
    expect(widgets({ church: true, leadership: true })).toEqual([
      'notifications',
      'schedule-summary',
      'cycles',
      'coverage',
      'trend',
      'admin-summary',
      'setup',
      'leadership',
    ]);
    expect(
      widgets({ church: true, leadership: true, serving: true }).slice(1, 3),
    ).toEqual(['serving-actions', 'schedule-summary']);
  });

  it('widens the schedule summary and cycles to a full row when the other is absent', () => {
    const spanOf = ({ id, capacities }: SpanOfInput) => {
      const span = homeWidgets.find((widget) => widget.id === id)?.span;
      const caps: HomeCapacities = {
        church: false,
        leadership: false,
        serving: false,
        leadershipScope: '',
        ...capacities,
      };
      return typeof span === 'function' ? span(caps) : span;
    };
    expect(
      spanOf({
        id: 'schedule-summary',
        capacities: { church: true, leadership: true },
      }),
    ).toBe(7);
    expect(
      spanOf({ id: 'cycles', capacities: { church: true, leadership: true } }),
    ).toBe(5);
    expect(
      spanOf({ id: 'schedule-summary', capacities: { leadership: true } }),
    ).toBe(12);
    expect(spanOf({ id: 'cycles', capacities: { church: true } })).toBe(12);
  });
});

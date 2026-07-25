import type { VolunteerPoolItem } from '../../hooks/use-volunteer-pool';
import {
  type GroupMode,
  groupVolunteersByRole,
  groupVolunteersByStatus,
} from './volunteer-pool-groups';

/**
 * One flat, virtualizable row. The rail used to render a nested tree of
 * sections, collapsibles and cards; a windowed list needs a single indexed
 * sequence instead, so the same tree is flattened here — headers and cards
 * interleaved in render order. Keeping this pure (state in, rows out) is what
 * lets the windowing in `VolunteerPoolList` stay a thin mapping and lets the
 * grouping/focus/collapse logic be unit-tested without a layout engine.
 */
export type PoolRow =
  | {
      kind: 'header';
      key: string;
      label: string;
      count: number;
      icon?: 'role' | 'focus';
    }
  | {
      /** The Unavailable section's toggle. Interactive, unlike a plain header. */
      kind: 'collapsible';
      key: string;
      label: string;
      count: number;
      open: boolean;
    }
  | { kind: 'card'; key: string; volunteer: VolunteerPoolItem; dragId?: string }
  | { kind: 'empty'; key: string; text: string };

interface FlattenPoolRowsInput {
  groupMode: GroupMode;
  /**
   * People ranked for the focused shift×role, best first, or null when nothing
   * is focused. Only the ungrouped view splits them into their own section;
   * grouping keeps the ranking as input order but folds them into its groups.
   */
  focusedVolunteers: VolunteerPoolItem[] | null;
  otherVolunteers: VolunteerPoolItem[];
  /** Whether the by-status "Unavailable" group is expanded. */
  unavailableOpen: boolean;
}

function pushCards(
  rows: PoolRow[],
  volunteers: VolunteerPoolItem[],
  section: string,
): void {
  for (const volunteer of volunteers) {
    rows.push({
      kind: 'card',
      key: `card:${section}:${volunteer.volunteerId}`,
      volunteer,
    });
  }
}

/**
 * Flattens the rail into an ordered row list. The output mirrors the pre-window
 * render exactly: focus and grouping compose the same way (grouping wins the
 * layout, focus ranking survives as order), an empty focused section still
 * shows its "No candidates" line, and a collapsed Unavailable group omits its
 * cards rather than hiding them with CSS — so a windowed list never measures a
 * card the leader cannot see.
 */
export function flattenPoolRows({
  groupMode,
  focusedVolunteers,
  otherVolunteers,
  unavailableOpen,
}: FlattenPoolRowsInput): PoolRow[] {
  const rows: PoolRow[] = [];
  // Focus ranking is preserved by keeping the focused block first; both group
  // helpers keep input order, so a grouped rail still leads with the best fit.
  const allVolunteers = [...(focusedVolunteers ?? []), ...otherVolunteers];

  if (groupMode === 'status') {
    const groups = groupVolunteersByStatus({ volunteers: allVolunteers });
    if (groups.ready.length) {
      rows.push({
        kind: 'header',
        key: 'header:ready',
        label: 'Ready',
        count: groups.ready.length,
      });
      pushCards(rows, groups.ready, 'ready');
    }
    if (groups.awaiting.length) {
      rows.push({
        kind: 'header',
        key: 'header:awaiting',
        label: 'Awaiting',
        count: groups.awaiting.length,
      });
      pushCards(rows, groups.awaiting, 'awaiting');
    }
    if (groups.unavailable.length) {
      rows.push({
        kind: 'collapsible',
        key: 'collapsible:unavailable',
        label: 'Unavailable',
        count: groups.unavailable.length,
        open: unavailableOpen,
      });
      if (unavailableOpen) pushCards(rows, groups.unavailable, 'unavailable');
    }
    return rows;
  }

  if (groupMode === 'role') {
    for (const group of groupVolunteersByRole({ volunteers: allVolunteers })) {
      rows.push({
        kind: 'header',
        key: `header:role:${group.roleName}`,
        label: group.roleName,
        count: group.volunteers.length,
        icon: 'role',
      });
      for (const volunteer of group.volunteers) {
        rows.push({
          kind: 'card',
          key: `card:role:${group.roleName}:${volunteer.volunteerId}`,
          volunteer,
          // A person qualified for several roles appears under each; the
          // per-role drag id keeps those copies distinct for dnd-kit, which is
          // safe now only because windowing mounts a handful at a time.
          dragId: `role-${group.roleName}-${volunteer.volunteerId}`,
        });
      }
    }
    return rows;
  }

  if (!focusedVolunteers) {
    pushCards(rows, otherVolunteers, 'all');
    return rows;
  }

  rows.push({
    kind: 'header',
    key: 'header:focused',
    label: 'Best for this role',
    count: focusedVolunteers.length,
    icon: 'focus',
  });
  if (focusedVolunteers.length) {
    pushCards(rows, focusedVolunteers, 'focused');
  } else {
    rows.push({
      kind: 'empty',
      key: 'empty:focused',
      text: 'No candidates for this role',
    });
  }
  if (otherVolunteers.length) {
    rows.push({
      kind: 'header',
      key: 'header:others',
      label: 'Everyone else',
      count: otherVolunteers.length,
    });
    pushCards(rows, otherVolunteers, 'others');
  }
  return rows;
}

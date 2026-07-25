import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  LayersIcon,
  LocateFixed,
} from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import type { VolunteerPoolItem } from '../../../hooks/use-volunteer-pool';
import type { AssignableFitTier } from '../../../utils/builder/cycle-builder-fit.utils';
import type { GroupMode } from '../../../utils/builder/volunteer-pool-groups';
import {
  flattenPoolRows,
  type PoolRow,
} from '../../../utils/builder/volunteer-pool-rows';
import { VolunteerCard } from './volunteer-card';

/**
 * Above this many rows the rail windows instead of mounting every card. Short
 * rails (the common case, and every jsdom fixture) render whole — no absolute
 * positioning, no measurement, so their DOM is exactly the pre-window one — and
 * the windowing that dnd-kit measurement made risky only ever runs on the long
 * lists it was meant for, where it is verified in the browser.
 */
const VIRTUALIZE_THRESHOLD = 48;

/** Reproduces the old `gap-2` between cards and the scrollbar gutter, but as
 * padding so it is inside each measured row — a virtualized item's margin is
 * not measured, its padding is. */
const ROW_SPACING = 'pb-2 pr-2';

interface VolunteerPoolListProps {
  groupMode: GroupMode;
  /**
   * People ranked for the focused shift×role, best first, or null when nothing
   * is focused. They are promoted above the rest of the pool rather than
   * replacing it — an unranked volunteer is still assignable as an override.
   */
  focusedVolunteers: VolunteerPoolItem[] | null;
  otherVolunteers: VolunteerPoolItem[];
  selectedVolunteerId?: string;
  idealVolunteerId?: string;
  onSelectVolunteer?: (volunteerId: string) => void;
  /**
   * When focus assignment is live: who may be committed and at what tier, plus
   * the handler that commits a card straight to the focused shift×role.
   */
  assignableVolunteerFits?: Map<string, AssignableFitTier> | null;
  onAssignVolunteer?: (volunteerId: string) => void;
  /** The rail's scroll viewport — the element the windowing measures against. */
  scrollElement: HTMLDivElement | null;
}

/**
 * The rail body. Focus and grouping are independent: focused people keep their
 * slot ranking wherever they land, so a grouped rail still shows the best
 * candidate first inside each group (both group helpers preserve input order).
 *
 * The tree is flattened to a single row list so it can be windowed — an
 * unvirtualized rail mounted a `useDraggable`, up to three tooltips and a
 * `ResizeObserver` per card, and group-by-role duplicated a person per role, so
 * 200 volunteers could put ~600 live draggables in front of dnd-kit's drag-start
 * measurement. Windowing mounts only what is on screen.
 */
export function VolunteerPoolList({
  groupMode,
  focusedVolunteers,
  otherVolunteers,
  selectedVolunteerId,
  idealVolunteerId,
  onSelectVolunteer,
  assignableVolunteerFits,
  onAssignVolunteer,
  scrollElement,
}: VolunteerPoolListProps) {
  const [unavailableOpen, setUnavailableOpen] = useState(false);
  const rows = useMemo(
    () =>
      flattenPoolRows({
        groupMode,
        focusedVolunteers,
        otherVolunteers,
        unavailableOpen,
      }),
    [groupMode, focusedVolunteers, otherVolunteers, unavailableOpen],
  );

  const renderRow = (row: PoolRow): ReactNode => {
    switch (row.kind) {
      case 'header':
        return (
          <GroupHeader label={row.label} count={row.count} icon={row.icon} />
        );
      case 'collapsible':
        return (
          <GroupHeader
            label={row.label}
            count={row.count}
            open={row.open}
            onToggle={() => setUnavailableOpen((open) => !open)}
          />
        );
      case 'empty':
        return <p className="px-1 text-muted-foreground text-xs">{row.text}</p>;
      case 'card':
        return (
          <VolunteerCard
            volunteer={row.volunteer}
            isSelected={selectedVolunteerId === row.volunteer.volunteerId}
            isIdeal={idealVolunteerId === row.volunteer.volunteerId}
            onSelect={onSelectVolunteer}
            assignFit={assignableVolunteerFits?.get(row.volunteer.volunteerId)}
            onAssignToFocused={onAssignVolunteer}
            dragId={row.dragId}
          />
        );
    }
  };

  if (rows.length <= VIRTUALIZE_THRESHOLD) {
    return (
      <div className="flex flex-col">
        {rows.map((row) => (
          <div key={row.key} className={ROW_SPACING}>
            {renderRow(row)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <VirtualPoolRows
      rows={rows}
      renderRow={renderRow}
      scrollElement={scrollElement}
    />
  );
}

interface VirtualPoolRowsProps {
  rows: PoolRow[];
  renderRow: (row: PoolRow) => ReactNode;
  scrollElement: HTMLDivElement | null;
}

/**
 * Windows the flat row list against the rail's scroll viewport. Rows are
 * measured live (`measureElement`) rather than assumed a fixed height — a card
 * with a wrapped roles line is taller than a header — and keyed by the row's own
 * key so a measurement survives the list re-ordering under a filter.
 */
function VirtualPoolRows({
  rows,
  renderRow,
  scrollElement,
}: VirtualPoolRowsProps) {
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => 96,
    overscan: 8,
    getItemKey: (index) => rows[index]?.key ?? index,
  });

  return (
    <div
      className="relative w-full"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((item) => {
        const row = rows[item.index];
        if (!row) return null;
        return (
          <div
            key={item.key}
            data-index={item.index}
            ref={virtualizer.measureElement}
            className={`absolute top-0 left-0 w-full ${ROW_SPACING}`}
            style={{ transform: `translateY(${item.start}px)` }}
          >
            {renderRow(row)}
          </div>
        );
      })}
    </div>
  );
}

interface GroupHeaderProps {
  label: string;
  count: number;
  icon?: 'role' | 'focus';
  open?: boolean;
  onToggle?: () => void;
}

function GroupHeader({ label, count, icon, open, onToggle }: GroupHeaderProps) {
  const content = (
    <>
      {onToggle ? (
        open ? (
          <ChevronDownIcon className="size-3.5" />
        ) : (
          <ChevronRightIcon className="size-3.5" />
        )
      ) : null}
      {icon === 'role' ? <LayersIcon className="size-3.5" /> : null}
      {icon === 'focus' ? (
        <LocateFixed className="size-3.5 text-primary" />
      ) : null}
      <span>{label}</span>
      <span className="ml-auto normal-case">{count}</span>
    </>
  );

  if (onToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${label} (${count})`}
        className="flex w-full items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide"
      >
        {content}
      </button>
    );
  }

  return (
    <h3 className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wide">
      {content}
    </h3>
  );
}

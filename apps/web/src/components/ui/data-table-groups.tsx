import { m } from '@church/i18n/messages';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { type ReactNode, useCallback, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DataTableItemInput } from '@/components/ui/data-table';
import { cn } from '@/lib/utils';

/** Nested rows for `DataTable`: a pre-ordered list folded into group rows
 * (month → week → day, week → day → block, template → block …) above its
 * leaf rows, with the shared indent, underline, fold button and phone rails. */

export interface GroupedGroupRow<L> {
  kind: 'group';
  /** Unique within the list: the keys of every enclosing level, joined. */
  key: string;
  /** 0 for the outermost level. */
  depth: number;
  /** Keys of the enclosing groups, outermost first; folding any hides it. */
  path: string[];
  /** The group's first leaf, which carries its labels. */
  leaf: L;
  /** Leaves inside it. */
  count: number;
  /** Folded on screen; set per render so react-aria re-renders the row. */
  isCollapsed?: boolean;
}

export interface GroupedLeafRow<L> {
  kind: 'leaf';
  key: string;
  /** How many groups it sits in. */
  depth: number;
  path: string[];
  leaf: L;
}

export type GroupedRow<L> = GroupedGroupRow<L> | GroupedLeafRow<L>;

export interface GroupLeavesInput<L> {
  /** Already in display order: a group starts wherever its key changes. */
  leaves: L[];
  /** One key per level, outermost first. */
  levels: ((leaf: L) => string)[];
  leafKey: (leaf: L) => string;
}

/** Flattens ordered leaves into group and leaf rows. A new outer group
 * restarts every group inside it. */
export function groupLeaves<L>({
  leaves,
  levels,
  leafKey,
}: GroupLeavesInput<L>): GroupedRow<L>[] {
  const values = leaves.map((leaf) => levels.map((level) => level(leaf)));
  return leaves.flatMap((leaf, index): GroupedRow<L>[] => {
    const own = values[index];
    const previous = values[index - 1];
    const keys = own.map((_, depth) => own.slice(0, depth + 1).join('/'));
    let changed = false;
    const groups = own.flatMap((value, depth): GroupedGroupRow<L>[] => {
      changed ||= value !== previous?.[depth];
      return changed
        ? [
            {
              kind: 'group',
              key: keys[depth],
              depth,
              path: keys.slice(0, depth),
              leaf,
              count: values.filter((other) =>
                own.slice(0, depth + 1).every((v, i) => other[i] === v),
              ).length,
            },
          ]
        : [];
    });
    return [
      ...groups,
      {
        kind: 'leaf',
        key: leafKey(leaf),
        depth: levels.length,
        path: keys,
        leaf,
      },
    ];
  });
}

export interface UseGroupCollapseInput {
  /** Group keys folded on first render. */
  defaultCollapsed?: Iterable<string>;
}

export interface VisibleRowsInput<L> {
  rows: GroupedRow<L>[];
}

/** Fold state for grouped rows. `visible` drops rows inside a folded group
 * and stamps each group row with fresh `isCollapsed`. */
export function useGroupCollapse({
  defaultCollapsed = [],
}: UseGroupCollapseInput = {}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(defaultCollapsed),
  );
  // Stable across renders, so memoised rows and cells only change with the fold state.
  const toggle = useCallback(
    (key: string) =>
      setCollapsed((current) => {
        const next = new Set(current);
        if (!next.delete(key)) next.add(key);
        return next;
      }),
    [],
  );
  const visible = useCallback(
    <L,>({ rows }: VisibleRowsInput<L>): GroupedRow<L>[] =>
      // Fresh objects each time: react-aria only re-renders a row whose item changed.
      rows
        .filter((row) => !row.path.some((key) => collapsed.has(key)))
        .map((row) =>
          row.kind === 'group'
            ? { ...row, isCollapsed: collapsed.has(row.key) }
            : row,
        ),
    [collapsed],
  );
  return { collapsed, setCollapsed, toggle, visible };
}

/** One indent step per nesting level, the width of a fold button and its gap,
 * so a row's content starts under its group's label. */
export const GROUP_INDENT = ['', 'pl-8', 'pl-16', 'pl-24', 'pl-32'];

/** A nested row's underline starts with its text, so the lines show what sits inside what:
 * the first cell's border goes transparent (keeping its height) and a 1px line that begins
 * at the indent sits on the row's border; a collapsed border straddles the cell edge,
 * hence the line hangs 1px below the cell. */
const NESTED_LINE =
  "[&>:first-child]:relative [&>:first-child]:border-b-transparent [&>:first-child]:after:absolute [&>:first-child]:after:right-0 [&>:first-child]:after:-bottom-px [&>:first-child]:after:h-px [&>:first-child]:after:bg-border [&>:first-child]:after:content-['']";
// Written out in full: Tailwind only generates classes it finds literally in the source.
const LINE_START = [
  '',
  `${NESTED_LINE} [&>:first-child]:after:w-[calc(100%-2.25rem)]`,
  `${NESTED_LINE} [&>:first-child]:after:w-[calc(100%-4.25rem)]`,
  `${NESTED_LINE} [&>:first-child]:after:w-[calc(100%-6.25rem)]`,
  `${NESTED_LINE} [&>:first-child]:after:w-[calc(100%-8.25rem)]`,
];

/** A leaf's underline starts 8px before its text, where its selection strip starts. */
const LEAF_LINE = [
  '',
  `${NESTED_LINE} [&>:first-child]:after:w-[calc(100%-1.75rem)]`,
  `${NESTED_LINE} [&>:first-child]:after:w-[calc(100%-3.75rem)]`,
  `${NESTED_LINE} [&>:first-child]:after:w-[calc(100%-5.75rem)]`,
  `${NESTED_LINE} [&>:first-child]:after:w-[calc(100%-7.75rem)]`,
];

/** The selected leaf is painted from its underline's start (8px before the text) to the row's end
 * (8px past its last content), 4px
 * in from top and bottom, at the control radius: one strip drawn across its cells (a row's own
 * pseudo-element would become a cell). Each cell is a stacking context, so the strip sits under
 * its text. */
const SELECTED_STRIP =
  "[&>*]:relative [&>*]:z-0 [&>*]:before:absolute [&>*]:before:inset-y-1 [&>*]:before:inset-x-0 [&>*]:before:-z-10 [&>*]:before:bg-accent/60 [&>*]:before:content-[''] [&>:first-child]:before:rounded-l-[var(--radius-md)] [&>:last-child]:before:rounded-r-[var(--radius-md)]";
const SELECTED_START = [
  '[&>:first-child]:before:left-1',
  '[&>:first-child]:before:left-[1.75rem]',
  '[&>:first-child]:before:left-[3.75rem]',
  '[&>:first-child]:before:left-[5.75rem]',
  '[&>:first-child]:before:left-[7.75rem]',
];

interface LeafRowClassNameInput {
  step: number;
  selected: boolean;
  extra?: string;
}

function leafRowClassName({ step, selected, extra }: LeafRowClassNameInput) {
  return cn(
    LEAF_LINE[step],
    // The last cell keeps the house DataTable's 4px end padding, so actions align with every table.
    selected && cn(SELECTED_STRIP, SELECTED_START[step]),
    extra,
  );
}

/** Indent step of a leaf at `depth`: under its group's label, or (`nested`) one step deeper,
 * for groups with a fold button, whose label already sits a step in. */
export function leafIndentStep({ depth, nested }: LeafIndentInput): number {
  return nested ? depth + 1 : depth;
}

export interface LeafIndentInput {
  depth: number;
  nested?: boolean;
}

/** Phone tree lines: one 1px rail per enclosing group, each under its group's
 * chevron (8px in, then 21px per level), the content starting past the last.
 * `-mt-3 pt-3` stretches the rails across the list's gap so they read as one line. */
// Written out in full: Tailwind only generates classes it finds literally in the source.
export const MOBILE_RAIL = [
  '',
  '-mt-3 pt-3 pl-[21px] bg-no-repeat bg-[image:linear-gradient(var(--color-border),var(--color-border))] bg-[size:1px_100%] bg-[position:8px_0]',
  '-mt-3 pt-3 pl-[42px] bg-no-repeat bg-[image:linear-gradient(var(--color-border),var(--color-border)),linear-gradient(var(--color-border),var(--color-border))] bg-[size:1px_100%,1px_100%] bg-[position:8px_0,29px_0]',
  '-mt-3 pt-3 pl-[63px] bg-no-repeat bg-[image:linear-gradient(var(--color-border),var(--color-border)),linear-gradient(var(--color-border),var(--color-border)),linear-gradient(var(--color-border),var(--color-border))] bg-[size:1px_100%,1px_100%,1px_100%] bg-[position:8px_0,29px_0,50px_0]',
];

const HEADINGS = ['h2', 'h3', 'h4', 'h5', 'h6'] as const;

/** Group weight by depth: the outermost semibold, the rest medium. */
export function groupWeight(depth: number): string {
  return depth === 0 ? 'font-semibold' : 'font-medium';
}

export interface GroupedRowPropsInput<L> {
  /** Classes for a group row; defaults to `groupWeight` and `text-sm`. */
  groupClassName?: (row: GroupedGroupRow<L>) => string | undefined;
  /** Extra classes for a leaf row. */
  leafClassName?: (row: GroupedLeafRow<L>) => string | undefined;
  /** Leaves sit one step deeper than their group's label (see `leafIndentStep`). */
  nestLeaves?: boolean;
  /** The leaf the page has open; painted inset, its other cues (aria-current, weight) stay the caller's. */
  isSelected?: (row: GroupedLeafRow<L>) => boolean;
}

/** Spread into `DataTable`: group rows span every column, and each underline
 * starts with its row's text. */
export function groupedRowProps<L>({
  groupClassName,
  leafClassName,
  nestLeaves = false,
  isSelected,
}: GroupedRowPropsInput<L> = {}) {
  return {
    rowSpansColumns: ({ item }: DataTableItemInput<GroupedRow<L>>) =>
      item.kind === 'group',
    rowClassName: ({ item }: DataTableItemInput<GroupedRow<L>>) =>
      item.kind === 'group'
        ? cn(
            LINE_START[item.depth + 1],
            groupClassName?.(item) ?? cn(groupWeight(item.depth), 'text-sm'),
          )
        : leafRowClassName({
            step: leafIndentStep({ depth: item.depth, nested: nestLeaves }),
            selected: isSelected?.(item) ?? false,
            extra: leafClassName?.(item),
          }),
  };
}

export interface GroupRowLabelProps<L> {
  item: GroupedGroupRow<L>;
  label: ReactNode;
  /** Plain-text name for the fold button's label. */
  name: string;
  /** False renders the label alone, with no fold button or count. */
  collapsible?: boolean;
  onToggle?: (key: string) => void;
  /** Extra classes for the fold button. */
  buttonClassName?: string;
}

/** A desktop group row's cell: the fold chevron, the label, the count. */
export function GroupRowLabel<L>({
  item,
  label,
  name,
  collapsible = true,
  onToggle,
  buttonClassName,
}: GroupRowLabelProps<L>) {
  const isCollapsed = item.isCollapsed ?? false;
  return (
    <span className={cn('block', GROUP_INDENT[item.depth])}>
      {collapsible ? (
        <span className="flex items-center gap-2">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            // As the Invitations row toggle: open is not a pressed state, so no fill.
            // 44px where the pointer is a finger (a tablet at desktop width).
            className={cn(
              buttonClassName,
              'aria-expanded:bg-transparent pointer-coarse:size-11',
            )}
            aria-expanded={!isCollapsed}
            aria-label={
              isCollapsed
                ? m.cycle_review_expand_event({ title: name })
                : m.cycle_review_collapse_event({ title: name })
            }
            onClick={() => onToggle?.(item.key)}
          >
            {isCollapsed ? <ChevronRight /> : <ChevronDown />}
          </Button>
          <span>{label}</span>
          {/* A glance at the size; the rows themselves are what is read. */}
          <Badge
            variant="secondary"
            className="tabular-nums"
            aria-hidden="true"
          >
            {item.count}
          </Badge>
        </span>
      ) : (
        label
      )}
    </span>
  );
}

export interface MobileGroupHeadingProps<L> {
  item: GroupedGroupRow<L>;
  label: ReactNode;
  collapsible?: boolean;
  onToggle?: (key: string) => void;
  /** Heading classes; defaults to `groupWeight` plus `text-sm`. */
  className?: string;
  /** Draw the tree rails of its enclosing groups. */
  rails?: boolean;
  /** Heading level of the outermost group: the next under the page's last heading. */
  headingLevel?: 2 | 3;
}

/** A phone group heading, its level from depth (`headingLevel` outermost). Collapsible,
 * the whole heading folds: a full-width target, the chevron beside the label. */
export function MobileGroupHeading<L>({
  item,
  label,
  collapsible = true,
  onToggle,
  className,
  rails = true,
  headingLevel = 3,
}: MobileGroupHeadingProps<L>) {
  const Heading = HEADINGS[item.depth + headingLevel - 2];
  const isCollapsed = item.isCollapsed ?? false;
  return (
    <div className={rails ? MOBILE_RAIL[item.depth] : undefined}>
      <Heading className={className ?? cn(groupWeight(item.depth), 'text-sm')}>
        {collapsible ? (
          // A disclosure: the heading keeps its own name, aria-expanded says the state.
          <button
            type="button"
            aria-expanded={!isCollapsed}
            className="radius-control flex min-h-11 w-full items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onToggle?.(item.key)}
          >
            {isCollapsed ? (
              <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
            ) : (
              <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
            )}
            <span className="min-w-0 flex-1">{label}</span>
            {/* A glance at the size; the rows themselves are what is read. */}
            <Badge
              variant="secondary"
              className="tabular-nums"
              aria-hidden="true"
            >
              {item.count}
            </Badge>
          </button>
        ) : (
          label
        )}
      </Heading>
    </div>
  );
}

import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  type GroupedRow,
  groupedRowProps,
  groupLeaves,
  leafIndentStep,
  MobileGroupHeading,
  useGroupCollapse,
} from '@/components/ui/data-table-groups';

interface Leaf {
  id: string;
  week: string;
  day: string;
}

const LEAVES: Leaf[] = [
  { id: 'a', week: 'w1', day: 'd1' },
  { id: 'b', week: 'w1', day: 'd1' },
  { id: 'c', week: 'w1', day: 'd2' },
  { id: 'd', week: 'w2', day: 'd3' },
];

function flatten() {
  return groupLeaves({
    leaves: LEAVES,
    levels: [(leaf) => leaf.week, (leaf) => leaf.day],
    leafKey: (leaf) => leaf.id,
  });
}

function describeRow(row: GroupedRow<Leaf>) {
  return row.kind === 'group'
    ? `${row.depth}:${row.key}(${row.count}) in [${row.path.join(',')}]`
    : `${row.depth}:${row.key} in [${row.path.join(',')}]`;
}

describe('groupLeaves', () => {
  it('opens a group wherever a key changes, with depth, path and leaf counts', () => {
    expect(flatten().map(describeRow)).toEqual([
      '0:w1(3) in []',
      '1:w1/d1(2) in [w1]',
      '2:a in [w1,w1/d1]',
      '2:b in [w1,w1/d1]',
      '1:w1/d2(1) in [w1]',
      '2:c in [w1,w1/d2]',
      '0:w2(1) in []',
      '1:w2/d3(1) in [w2]',
      '2:d in [w2,w2/d3]',
    ]);
  });

  it('restarts inner groups under a new outer group even when the inner key repeats', () => {
    const rows = groupLeaves({
      leaves: [
        { id: 'a', week: 'w1', day: 'same' },
        { id: 'b', week: 'w2', day: 'same' },
      ],
      levels: [(leaf) => leaf.week, (leaf) => leaf.day],
      leafKey: (leaf) => leaf.id,
    });
    expect(rows.map(describeRow)).toEqual([
      '0:w1(1) in []',
      '1:w1/same(1) in [w1]',
      '2:a in [w1,w1/same]',
      '0:w2(1) in []',
      '1:w2/same(1) in [w2]',
      '2:b in [w2,w2/same]',
    ]);
  });

  it('returns bare leaves at depth 0 with no levels', () => {
    expect(
      groupLeaves({
        leaves: LEAVES,
        levels: [],
        leafKey: (leaf) => leaf.id,
      }).map(describeRow),
    ).toEqual(['0:a in []', '0:b in []', '0:c in []', '0:d in []']);
  });
});

describe('useGroupCollapse', () => {
  it('hides everything inside a folded group and marks the group folded', () => {
    const rows = flatten();
    const { result } = renderHook(() =>
      useGroupCollapse({ defaultCollapsed: ['w1/d1'] }),
    );
    expect(result.current.visible({ rows }).map((row) => row.key)).toEqual([
      'w1',
      'w1/d1',
      'w1/d2',
      'c',
      'w2',
      'w2/d3',
      'd',
    ]);
    act(() => result.current.toggle('w1'));
    const folded = result.current.visible({ rows });
    expect(folded.map((row) => row.key)).toEqual(['w1', 'w2', 'w2/d3', 'd']);
    expect(folded[0]).toMatchObject({ kind: 'group', isCollapsed: true });
    act(() => result.current.toggle('w1'));
    expect(result.current.visible({ rows })).toHaveLength(7);
  });
});

describe('MobileGroupHeading', () => {
  it('takes its heading level from depth and folds from the whole heading', () => {
    const [week, day] = flatten();
    if (week.kind !== 'group' || day.kind !== 'group')
      throw new Error('Expected group rows.');
    render(
      <>
        <MobileGroupHeading item={week} label="Week one" />
        <MobileGroupHeading item={day} label="Day one" collapsible={false} />
      </>,
    );
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      'Week one3',
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(
      'Day one',
    );
  });

  it('starts at the given heading level', () => {
    const [week, day] = flatten();
    if (week.kind !== 'group' || day.kind !== 'group')
      throw new Error('Expected group rows.');
    render(
      <>
        <MobileGroupHeading item={week} label="Week one" headingLevel={2} />
        <MobileGroupHeading item={day} label="Day one" headingLevel={2} />
      </>,
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Week one3',
    );
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      'Day one',
    );
  });
});

describe('groupedRowProps', () => {
  const leafA = () => {
    const leaf = flatten().find((row) => row.kind === 'leaf');
    if (!leaf) throw new Error('Expected a leaf row.');
    return leaf;
  };

  it('nests leaves one indent step past the label of a foldable group', () => {
    expect(leafIndentStep({ depth: 2 })).toBe(2);
    expect(leafIndentStep({ depth: 2, nested: true })).toBe(3);
    const { rowClassName } = groupedRowProps<Leaf>({ nestLeaves: true });
    // The underline starts 8px before the step-3 text (6rem + 0.25rem padding).
    expect(rowClassName({ item: leafA() })).toContain(
      '[&>:first-child]:after:w-[calc(100%-5.75rem)]',
    );
  });

  it('paints only the selected leaf, from its underline start', () => {
    const { rowClassName } = groupedRowProps<Leaf>({
      nestLeaves: true,
      isSelected: (row) => row.leaf.id === 'a',
    });
    const [, , a, b] = flatten();
    expect(rowClassName({ item: a })).toContain(
      '[&>:first-child]:before:left-[5.75rem]',
    );
    expect(rowClassName({ item: a })).toContain('[&>*]:before:bg-accent/60');
    expect(rowClassName({ item: b })).not.toContain('before:bg-accent');
  });
});

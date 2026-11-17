import { m } from '@church/i18n/messages';
import type { ReactNode } from 'react';
import type { Selection, SortDescriptor } from 'react-aria-components';
import type { TableProps as TablePrimitiveProps } from 'react-aria-components/Table';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

type DataTableSelectionMode = NonNullable<TablePrimitiveProps['selectionMode']>;
type DataTableSelectionBehavior = NonNullable<
  TablePrimitiveProps['selectionBehavior']
>;

export interface DataTableColumn {
  id: string;
  name: string;
  allowsSorting?: boolean;
  isRowHeader?: boolean;
  /** Keeps the name for screen readers only. Defaults to true for the
   * `actionsColumnId` column, whose buttons name themselves; pass `false` to
   * show it. */
  hideName?: boolean;
}

export interface DataTableItemInput<T> {
  item: T;
}

export interface DataTableCellInput<T> {
  item: T;
  column: DataTableColumn;
}

export interface DataTableProps<T extends object> {
  'aria-label': string;
  columns: DataTableColumn[];
  items: T[];
  /** Items rendered in the mobile card list. Defaults to `items`. A consumer
   * whose desktop rows include entries with no mobile card representation
   * (`renderMobileCard` returning `null` for them, e.g. expandable child
   * rows) passes a filtered subset here instead, so the mobile listbox
   * doesn't end up with empty placeholder entries for rows it can't render. */
  mobileItems?: T[];
  rowId: (input: DataTableItemInput<T>) => string;
  /** React reconciliation key for a desktop row (mobile cards key by `rowId`, so
   * they keep focus and state), separate from `rowId`. Defaults to
   * `rowId`'s return value. A consumer whose cells depend on interaction
   * state the underlying react-aria Collection doesn't automatically
   * re-render on (see `ui/table.tsx`'s `TableBody` comment) can fold that
   * state in here to force a fresh render, without also destabilizing
   * `rowId` — which react-aria uses as the row's DOM `id` and selection
   * key, and which callers may capture and re-query by. */
  rowKey?: (input: DataTableItemInput<T>) => string;
  renderCell: (input: DataTableCellInput<T>) => ReactNode;
  renderMobileCard: (input: DataTableItemInput<T>) => ReactNode;
  /** Rendered in the desktop actions column (when `columns` includes one
   * with id `actionsColumnId`) and appended under each mobile card, so
   * consumers write a row's actions once instead of duplicating them per
   * layout. */
  rowActions?: (input: DataTableItemInput<T>) => ReactNode;
  /** Column id that `rowActions` renders into on desktop. Defaults to
   * `'actions'`; ignored if `rowActions` is omitted. */
  actionsColumnId?: string;
  /** A desktop row that renders one cell spanning every column (e.g. an
   * expanded details row); `renderCell` is called once with the first column. */
  rowSpansColumns?: (input: DataTableItemInput<T>) => boolean;
  rowTestId?: (input: DataTableItemInput<T>) => string | undefined;
  /** Extra classes for a desktop row, e.g. to mark one that needs attention. */
  rowClassName?: (input: DataTableItemInput<T>) => string | undefined;
  /** `data-testid` of the mobile list container. Defaults to
   * `'data-table-mobile-list'`. */
  mobileListTestId?: string;
  /** Rendered inside the mobile list container, above the mapped cards —
   * e.g. a mobile-only "add" trigger that belongs to this list rather than
   * to any one row. */
  mobileListHeader?: ReactNode;
  sortDescriptor?: SortDescriptor;
  onSortChange?: (sortDescriptor: SortDescriptor) => void;
  isLoading?: boolean;
  loadingContent?: ReactNode;
  emptyContent?: ReactNode;
  selectionMode?: DataTableSelectionMode;
  selectionBehavior?: DataTableSelectionBehavior;
  disallowEmptySelection?: boolean;
  selectedKeys?: Selection;
  onSelectionChange?: (keys: Selection) => void;
  className?: string;
}

const defaultLoadingContent = () => (
  <p
    className="text-muted-foreground text-sm"
    data-testid="data-table-loading-state"
  >
    {m.shell_table_loading()}
  </p>
);

const defaultEmptyContent = () => (
  <p
    className="text-muted-foreground text-sm"
    data-testid="data-table-empty-state"
  >
    {m.shell_table_empty()}
  </p>
);

/** Shared BL-023 table convention: owns the responsive desktop
 * table/mobile card composition, loading/empty states, and React Aria
 * selection passthrough over `ui/table.tsx`'s primitives. Consumers keep
 * their own columns, items, row identity, sorting, and domain actions —
 * this wrapper only removes the duplicated composition around them. */
export function DataTable<T extends object>({
  'aria-label': ariaLabel,
  columns,
  items,
  mobileItems = items,
  rowId,
  rowKey,
  renderCell,
  renderMobileCard,
  rowActions,
  actionsColumnId = 'actions',
  rowSpansColumns,
  rowTestId,
  rowClassName,
  mobileListTestId = 'data-table-mobile-list',
  mobileListHeader,
  sortDescriptor,
  onSortChange,
  isLoading = false,
  loadingContent = defaultLoadingContent(),
  emptyContent = defaultEmptyContent(),
  selectionMode,
  selectionBehavior,
  disallowEmptySelection,
  selectedKeys,
  onSelectionChange,
  className,
}: DataTableProps<T>) {
  const isSelectable = selectionMode != null && selectionMode !== 'none';
  // The actions column always closes the row, whatever order the consumer passed.
  const orderedColumns = [
    ...columns.filter((column) => column.id !== actionsColumnId),
    ...columns.filter((column) => column.id === actionsColumnId),
  ];

  if (isLoading) {
    return <div className={className}>{loadingContent}</div>;
  }

  if (items.length === 0) {
    return <div className={className}>{emptyContent}</div>;
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div
        className="space-y-3 md:hidden"
        role={isSelectable ? 'listbox' : 'list'}
        aria-label={ariaLabel}
        data-testid={mobileListTestId}
      >
        {mobileListHeader}
        {mobileItems.map((item) => {
          const id = rowId({ item });
          return (
            <div
              key={id}
              role={isSelectable ? undefined : 'listitem'}
              data-testid={rowTestId?.({ item })}
            >
              {renderMobileCard({ item })}
              {rowActions ? rowActions({ item }) : null}
            </div>
          );
        })}
      </div>

      <div className="hidden md:block">
        <Table
          aria-label={ariaLabel}
          sortDescriptor={sortDescriptor}
          onSortChange={onSortChange}
          selectionMode={selectionMode}
          selectionBehavior={selectionBehavior}
          disallowEmptySelection={disallowEmptySelection}
          selectedKeys={selectedKeys}
          onSelectionChange={onSelectionChange}
        >
          <TableHeader columns={orderedColumns}>
            {(column) => (
              <TableColumn
                isRowHeader={column.isRowHeader}
                allowsSorting={column.allowsSorting}
                className={
                  column.id === actionsColumnId ? 'text-end' : undefined
                }
              >
                {(column.hideName ?? column.id === actionsColumnId) ? (
                  <span className="sr-only">{column.name}</span>
                ) : (
                  column.name
                )}
              </TableColumn>
            )}
          </TableHeader>
          <TableBody items={items}>
            {(item) => {
              const id = rowId({ item });
              const key = rowKey ? rowKey({ item }) : id;
              const spans = rowSpansColumns?.({ item }) ?? false;
              return (
                <TableRow
                  key={key}
                  id={id}
                  columns={spans ? orderedColumns.slice(0, 1) : orderedColumns}
                  data-testid={rowTestId?.({ item })}
                  className={rowClassName?.({ item })}
                >
                  {(column) => (
                    <TableCell
                      colSpan={spans ? columns.length : undefined}
                      // Row actions always sit flush right, never centered or at the start.
                      className={
                        !spans && column.id === actionsColumnId
                          ? 'text-end *:justify-end'
                          : undefined
                      }
                    >
                      {rowActions && column.id === actionsColumnId
                        ? rowActions({ item })
                        : renderCell({ item, column })}
                    </TableCell>
                  )}
                </TableRow>
              );
            }}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

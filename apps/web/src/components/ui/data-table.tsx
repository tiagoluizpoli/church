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
  rowId: (input: DataTableItemInput<T>) => string;
  /** React reconciliation key for a row, separate from `rowId`. Defaults to
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
  rowTestId?: (input: DataTableItemInput<T>) => string;
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

const DEFAULT_LOADING_CONTENT = (
  <p
    className="text-muted-foreground text-sm"
    data-testid="data-table-loading-state"
  >
    Loading…
  </p>
);

const DEFAULT_EMPTY_CONTENT = (
  <p
    className="text-muted-foreground text-sm"
    data-testid="data-table-empty-state"
  >
    No data available.
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
  rowId,
  rowKey,
  renderCell,
  renderMobileCard,
  rowActions,
  actionsColumnId = 'actions',
  rowTestId,
  mobileListTestId = 'data-table-mobile-list',
  mobileListHeader,
  sortDescriptor,
  onSortChange,
  isLoading = false,
  loadingContent = DEFAULT_LOADING_CONTENT,
  emptyContent = DEFAULT_EMPTY_CONTENT,
  selectionMode,
  selectionBehavior,
  disallowEmptySelection,
  selectedKeys,
  onSelectionChange,
  className,
}: DataTableProps<T>) {
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
        role="listbox"
        data-testid={mobileListTestId}
      >
        {mobileListHeader}
        {items.map((item) => {
          const id = rowId({ item });
          const key = rowKey ? rowKey({ item }) : id;
          return (
            <div key={key} data-testid={rowTestId?.({ item })}>
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
          <TableHeader columns={columns}>
            {(column) => (
              <TableColumn
                isRowHeader={column.isRowHeader}
                allowsSorting={column.allowsSorting}
              >
                {column.name}
              </TableColumn>
            )}
          </TableHeader>
          <TableBody items={items}>
            {(item) => {
              const id = rowId({ item });
              const key = rowKey ? rowKey({ item }) : id;
              return (
                <TableRow
                  key={key}
                  id={id}
                  columns={columns}
                  data-testid={rowTestId?.({ item })}
                >
                  {(column) => (
                    <TableCell>
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

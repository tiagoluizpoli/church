import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { ChevronRightIcon } from 'lucide-react';
import {
  describeUsualSetupEntry,
  formatTimeRange,
  formatWeekday,
  type UsualSetupBlock,
} from './usual-setup.utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Skeleton } from '@/components/ui/skeleton';
import { useUsualSetup } from '@/features/ministries/usual-setup-queries';
import { useCallerCapabilities } from '@/shared/hooks/use-caller-capabilities';

interface UsualSetupListProps {
  ministryId: string;
}

interface TemplateGroup {
  templateId: string;
  templateName: string;
  weekday: number;
  blocks: UsualSetupBlock[];
}

interface GroupByTemplateInput {
  blocks: UsualSetupBlock[];
}

/** Keeps the server's template-name then block order. */
function groupByTemplate({ blocks }: GroupByTemplateInput): TemplateGroup[] {
  const groups = new Map<string, TemplateGroup>();
  for (const block of blocks) {
    const group = groups.get(block.templateId) ?? {
      templateId: block.templateId,
      templateName: block.templateName,
      weekday: block.weekday,
      blocks: [],
    };
    group.blocks.push(block);
    groups.set(block.templateId, group);
  }
  return [...groups.values()];
}

type UsualSetupRow =
  | { kind: 'group'; key: string; templateName: string; weekday: number }
  | { kind: 'block'; key: string; block: UsualSetupBlock };

const USUAL_SETUP_COLUMNS: DataTableColumn[] = [
  { id: 'name', name: m.usual_setup_col_block(), isRowHeader: true },
  { id: 'time', name: m.usual_setup_col_time() },
  { id: 'assignment', name: m.usual_setup_col_assignment() },
  { id: 'actions', name: m.people_column_actions() },
];

function flattenGroups(groups: TemplateGroup[]): UsualSetupRow[] {
  const rows: UsualSetupRow[] = [];
  for (const group of groups) {
    rows.push({
      kind: 'group',
      key: group.templateId,
      templateName: group.templateName,
      weekday: group.weekday,
    });
    for (const block of group.blocks) {
      rows.push({ kind: 'block', key: block.sourceTemplateTimeBlockId, block });
    }
  }
  return rows;
}

/** The Usual setup tab: every current Time block and what this Ministry serves there. */
export function UsualSetupList({ ministryId }: UsualSetupListProps) {
  const { isChurchAdmin } = useCallerCapabilities();
  const setup = useUsualSetup({ ministryId });
  const groups = setup.data
    ? groupByTemplate({ blocks: setup.data.blocks })
    : [];
  const rows = flattenGroups(groups);

  return (
    <section className="space-y-4" aria-label={m.usual_setup_list_label()}>
      <p className="text-muted-foreground text-sm">
        {m.usual_setup_description()}
      </p>
      {setup.isPending ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : setup.isError ? (
        <div className="space-y-2" role="alert">
          <p className="text-muted-foreground">{m.usual_setup_load_failed()}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setup.refetch()}
          >
            {m.usual_setup_retry()}
          </Button>
        </div>
      ) : groups.length === 0 ? (
        <div className="space-y-2" role="status">
          <p className="text-muted-foreground">
            {m.usual_setup_no_templates()}
          </p>
          {isChurchAdmin ? (
            <Link
              to="/event-templates"
              className="text-sm underline underline-offset-2"
            >
              {m.usual_setup_open_event_templates()}
            </Link>
          ) : (
            <p className="text-muted-foreground text-sm">
              {m.usual_setup_no_templates_leader()}
            </p>
          )}
        </div>
      ) : (
        <DataTable<UsualSetupRow>
          aria-label={m.usual_setup_list_label()}
          columns={USUAL_SETUP_COLUMNS}
          items={rows}
          rowId={({ item }) => item.key}
          rowClassName={({ item }) =>
            item.kind === 'group' ? 'font-semibold text-sm' : undefined
          }
          renderCell={({ item, column }) => {
            if (item.kind === 'group') {
              if (column.id !== 'name') return null;
              return (
                <span>
                  {item.templateName}{' '}
                  <span className="font-normal text-muted-foreground">
                    · {formatWeekday(item)}
                  </span>
                </span>
              );
            }
            const { block } = item;
            if (column.id === 'name') {
              return (
                <span className="space-y-0.5 pl-8">
                  <span className="block">{block.label}</span>
                  {block.needsReview ? (
                    <span className="block text-amber-700 text-xs dark:text-amber-500">
                      <strong>{m.usual_setup_needs_review()}</strong>{' '}
                      {m.usual_setup_review_fallback()}
                    </span>
                  ) : null}
                </span>
              );
            }
            if (column.id === 'time') return formatTimeRange(block);
            if (column.id === 'assignment') {
              return (
                <span data-testid="usual-setup-summary">
                  {describeUsualSetupEntry(block)}
                </span>
              );
            }
            return null;
          }}
          renderMobileCard={({ item }) => {
            if (item.kind === 'group') {
              return (
                <div className="border-b pt-3 pb-1 first:pt-0">
                  <span className="font-semibold text-sm">
                    {item.templateName}
                  </span>
                  <span className="font-normal text-muted-foreground text-xs">
                    {' '}
                    · {formatWeekday(item)}
                  </span>
                </div>
              );
            }
            const { block } = item;
            return (
              <Link
                to="/ministries/$ministryId/usual-setup/$blockId"
                params={{
                  ministryId,
                  blockId: block.sourceTemplateTimeBlockId,
                }}
                aria-label={block.label}
                className="surface-subtle flex items-center gap-3 p-3"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <span className="block font-medium text-sm">
                    {block.label}
                  </span>
                  <span className="block text-muted-foreground text-xs">
                    {formatTimeRange(block)}
                  </span>
                  <span
                    className="block text-sm"
                    data-testid="usual-setup-summary"
                  >
                    {describeUsualSetupEntry(block)}
                  </span>
                  {block.needsReview ? (
                    <span className="block text-amber-700 text-xs dark:text-amber-500">
                      <strong>{m.usual_setup_needs_review()}</strong>{' '}
                      {m.usual_setup_review_fallback()}
                    </span>
                  ) : null}
                </div>
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </Link>
            );
          }}
          rowActions={({ item }) => {
            if (item.kind === 'group') return null;
            return (
              <div className="flex w-full justify-end gap-2 max-md:hidden">
                <Link
                  to="/ministries/$ministryId/usual-setup/$blockId"
                  params={{
                    ministryId,
                    blockId: item.block.sourceTemplateTimeBlockId,
                  }}
                  aria-label={m.ministries_open_label({
                    name: item.block.label,
                  })}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                >
                  {m.ministries_open()}
                </Link>
              </div>
            );
          }}
        />
      )}
    </section>
  );
}

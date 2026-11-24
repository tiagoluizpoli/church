import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { ChevronRightIcon } from 'lucide-react';
import {
  describeUsualSetupEntry,
  formatTimeRange,
  formatWeekday,
  type UsualSetupBlock,
} from './usual-setup.utils';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import { useUsualSetup } from '@/features/ministries/usual-setup-queries';
import { useCallerCapabilities } from '@/shared/hooks/use-caller-capabilities';

interface UsualSetupListProps {
  ministryId: string;
}

const USUAL_SETUP_COLUMNS: DataTableColumn[] = [
  { id: 'name', name: m.usual_setup_col_block(), isRowHeader: true },
  { id: 'time', name: m.usual_setup_col_time() },
  { id: 'assignment', name: m.usual_setup_col_assignment() },
  { id: 'actions', name: m.people_column_actions() },
];

interface TemplateLabelProps {
  block: UsualSetupBlock;
}

/** `Culto de Domingo · Domingo`: the template, its weekday muted. */
function TemplateLabel({ block }: TemplateLabelProps) {
  return (
    <span>
      {block.templateName}
      {block.weekday === null ? null : (
        <span className="font-normal text-muted-foreground">
          {' '}
          · {formatWeekday({ weekday: block.weekday })}
        </span>
      )}
    </span>
  );
}

/** The Usual setup tab: every current Time block and what this Ministry serves there. */
export function UsualSetupList({ ministryId }: UsualSetupListProps) {
  const { isChurchAdmin } = useCallerCapabilities();
  const setup = useUsualSetup({ ministryId });
  // One group per template, in the server's order of first appearance.
  const byTemplate = new Map<string, UsualSetupBlock[]>();
  for (const block of setup.data?.blocks ?? []) {
    const group = byTemplate.get(block.templateId);
    if (group) group.push(block);
    else byTemplate.set(block.templateId, [block]);
  }
  const groups = [...byTemplate.values()];

  return (
    <section className="space-y-4" aria-label={m.usual_setup_list_label()}>
      <p className="text-muted-foreground text-sm">
        {m.usual_setup_description()}
      </p>
      {setup.isPending ? (
        <Pending label={m.usual_setup_loading()} className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </Pending>
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
              to="/app/event-templates"
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
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group[0].templateId} className="space-y-2">
              <h3 className="border-b pb-1 font-semibold text-sm">
                <TemplateLabel block={group[0]} />
              </h3>
              <DataTable<UsualSetupBlock>
                aria-label={`${m.usual_setup_list_label()}: ${group[0].templateName}`}
                columns={USUAL_SETUP_COLUMNS}
                items={group}
                rowId={({ item }) => item.sourceTemplateTimeBlockId}
                renderCell={({ item: block, column }) => {
                  if (column.id === 'name') {
                    return (
                      <span className="flex items-center gap-2">
                        {block.label}
                        {block.needsReview ? (
                          <Badge
                            variant="outline"
                            className="border-amber-600/40 text-amber-700 dark:text-amber-500"
                          >
                            {m.usual_setup_needs_review()}
                            <span className="sr-only">
                              {' '}
                              {m.usual_setup_review_fallback()}
                            </span>
                          </Badge>
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
                renderMobileCard={({ item: block }) => {
                  return (
                    <Link
                      to="/app/ministries/$ministryId/usual-setup/$blockId"
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
                  return (
                    <div className="flex w-full justify-end gap-2 max-md:hidden">
                      <Link
                        to="/app/ministries/$ministryId/usual-setup/$blockId"
                        params={{
                          ministryId,
                          blockId: item.sourceTemplateTimeBlockId,
                        }}
                        aria-label={m.ministries_open_label({
                          name: item.label,
                        })}
                        className={buttonVariants({
                          variant: 'outline',
                          size: 'sm',
                        })}
                      >
                        {m.ministries_open()}
                      </Link>
                    </div>
                  );
                }}
              />
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

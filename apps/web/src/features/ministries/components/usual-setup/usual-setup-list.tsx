import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { ChevronRightIcon } from 'lucide-react';
import {
  describeUsualSetupEntry,
  formatTimeRange,
  formatWeekday,
  type UsualSetupBlock,
} from './usual-setup.utils';
import { Button } from '@/components/ui/button';
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

/** The Usual setup tab: every current Time block and what this Ministry serves there. */
export function UsualSetupList({ ministryId }: UsualSetupListProps) {
  const { isChurchAdmin } = useCallerCapabilities();
  const setup = useUsualSetup({ ministryId });

  if (setup.isPending) {
    return (
      <div className="max-w-2xl space-y-2" aria-busy="true">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (setup.isError) {
    return (
      <div className="space-y-2" role="alert">
        <p className="text-muted-foreground">{m.usual_setup_load_failed()}</p>
        <Button type="button" variant="outline" onClick={() => setup.refetch()}>
          {m.usual_setup_retry()}
        </Button>
      </div>
    );
  }

  const groups = groupByTemplate({ blocks: setup.data.blocks });

  if (groups.length === 0) {
    return (
      <div className="max-w-2xl space-y-2" role="status">
        <p className="text-muted-foreground">{m.usual_setup_no_templates()}</p>
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
    );
  }

  return (
    <section
      className="max-w-2xl space-y-6"
      aria-label={m.usual_setup_list_label()}
    >
      <p className="text-muted-foreground text-sm">
        {m.usual_setup_description()}
      </p>
      {groups.map((group) => (
        <div key={group.templateId} className="space-y-2">
          <h2 className="font-medium text-sm">
            {group.templateName}{' '}
            <span className="text-muted-foreground">
              · {formatWeekday(group)}
            </span>
          </h2>
          <ul
            aria-label={group.templateName}
            className="surface-panel divide-y"
          >
            {group.blocks.map((block) => (
              <li key={block.sourceTemplateTimeBlockId}>
                <Link
                  to="/ministries/$ministryId/usual-setup/$blockId"
                  params={{
                    ministryId,
                    blockId: block.sourceTemplateTimeBlockId,
                  }}
                  className="flex min-h-11 items-center justify-between gap-3 p-3 hover:bg-muted/50"
                >
                  <span className="space-y-0.5">
                    <span className="block font-medium text-sm">
                      {block.label}
                    </span>
                    <span className="block text-muted-foreground text-xs">
                      {formatTimeRange(block)}
                    </span>
                    {block.needsReview ? (
                      <span className="block text-amber-700 text-xs dark:text-amber-500">
                        <strong>{m.usual_setup_needs_review()}</strong>{' '}
                        {m.usual_setup_review_fallback()}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2 text-right text-sm">
                    <span data-testid="usual-setup-summary">
                      {describeUsualSetupEntry(block)}
                    </span>
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="size-4 text-muted-foreground"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

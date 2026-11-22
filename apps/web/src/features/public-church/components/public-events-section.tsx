import { m } from '@church/i18n/messages';
import { formatInstant, parseInstant } from '@church/time';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  ListPublicChurchEvents200,
  ListPublicChurchEvents200ItemsItemBlocksItem as PublicBlock,
} from '@/infrastructure/api/churchAPI.schemas';
import { publicChurchProfileApi } from '@/utils/api-instances';

const MOVED_ONCE_STEPS = 2;

interface PublicEventsSectionProps {
  slug: string;
}

/** Upcoming Public Events, paged by the server; hidden when there are none. */
export function PublicEventsSection({ slug }: PublicEventsSectionProps) {
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['public-church-events', slug],
      queryFn: ({ pageParam }) =>
        publicChurchProfileApi.listPublicChurchEvents(
          slug,
          pageParam ? { cursor: pageParam } : undefined,
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage: ListPublicChurchEvents200) =>
        lastPage.nextCursor,
    });
  const [first] = data?.pages ?? [];
  if (!first) return null;
  const { timezone } = first;
  const events = data?.pages.flatMap((page) => page.items) ?? [];
  if (events.length === 0) return null;

  return (
    <section aria-labelledby="public-events-title" className="mt-8">
      <h2
        id="public-events-title"
        className="font-semibold text-xl tracking-tight"
      >
        {m.public_events_title()}
      </h2>
      <ul className="mt-4 flex flex-col gap-4">
        {events.map((event) => (
          <li
            key={`${event.start}-${event.title}`}
            className="rounded-md border p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{event.title}</h3>
              {event.cancelled ? (
                <Badge variant="outline">{m.public_events_cancelled()}</Badge>
              ) : null}
            </div>
            <ul className="mt-2 flex flex-col gap-2">
              {event.blocks.map((block) => (
                <li key={`${block.start}-${block.label}`}>
                  <BlockRow block={block} timeZone={timezone} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          disabled={isFetchingNextPage}
          onClick={() => fetchNextPage()}
        >
          {m.public_events_load_more()}
        </Button>
      ) : null}
    </section>
  );
}

interface BlockRowProps {
  block: PublicBlock;
  timeZone: string;
}

function BlockRow({ block, timeZone }: BlockRowProps) {
  const { label, start, place, cancelled, movePath } = block;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
      {label ? <span className="font-medium">{label}</span> : null}
      <BlockTime
        start={start}
        movePath={movePath}
        timeZone={timeZone}
        cancelled={cancelled}
      />
      {place ? <span className="text-muted-foreground">{place}</span> : null}
      {cancelled ? (
        <Badge variant="outline">{m.public_events_cancelled()}</Badge>
      ) : null}
    </div>
  );
}

interface BlockTimeProps {
  start: string;
  movePath: PublicBlock['movePath'];
  timeZone: string;
  cancelled: boolean;
}

function BlockTime({ start, movePath, timeZone, cancelled }: BlockTimeProps) {
  const [open, setOpen] = useState(false);
  const show = (instant: string) =>
    formatInstant({ instant: parseInstant({ value: instant }), timeZone });
  const current = (
    <span className={cancelled ? 'line-through' : undefined}>
      {show(start)}
    </span>
  );
  const [original] = movePath;
  if (!original) return current;
  if (movePath.length === MOVED_ONCE_STEPS) {
    return (
      <span>
        <s className="text-muted-foreground">{show(original.start)}</s>
        {' → '}
        {current}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      {current}
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto p-0"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? m.public_events_history_hide() : m.public_events_history_show()}
      </Button>
      {open ? (
        <span className="text-muted-foreground">
          {movePath.map((step, index) =>
            index === movePath.length - 1 ? (
              <span key={step.start}>{show(step.start)}</span>
            ) : (
              <span key={step.start}>
                <s>{show(step.start)}</s>
                {' → '}
              </span>
            ),
          )}
        </span>
      ) : null}
    </span>
  );
}

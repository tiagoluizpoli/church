import { ministry, templateTimeBlock, usualSetup } from '@church/db';
import { and, eq, exists, type SQL, sql } from 'drizzle-orm';
import type { NeedsReviewConditionInput } from './ministry-needs-review.sql.types';

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** Wall-clock minutes forward from the block's start; an earlier time is next day. */
function offsetFromBlockStart(time: SQL): SQL {
  const minutes = (value: SQL) =>
    sql`(extract(hour from ${value})::int * ${sql.raw(`${MINUTES_PER_HOUR}`)} + extract(minute from ${value})::int)`;
  const delta = sql`${minutes(time)} - ${minutes(sql`${templateTimeBlock.startTime}`)}`;
  const day = sql.raw(`${MINUTES_PER_DAY}`);
  return sql`((${delta} + ${day}) % ${day})`;
}

/**
 * A manual split with a span that is empty or reversed, starts before the
 * previous one ends (or before the block), or ends after the block.
 */
function splitOverflowsBlock(): SQL {
  const start = offsetFromBlockStart(sql`(span.value ->> 'startTime')::time`);
  const end = offsetFromBlockStart(sql`(span.value ->> 'endTime')::time`);
  const blockEnd = offsetFromBlockStart(sql`${templateTimeBlock.endTime}`);
  return sql`exists (
    select 1
    from (
      select
        ${start} as starts,
        ${end} as ends,
        lag(${end}, 1, 0) over (order by span.position) as previous_end
      from jsonb_array_elements(${usualSetup.shiftSplit} -> 'spans')
        with ordinality as span(value, position)
    ) as spans
    where spans.ends <= spans.starts
      or spans.starts < spans.previous_end
      or spans.ends > ${blockEnd}
  )`;
}

/**
 * Whether the outer query's `ministry` row has a Usual setup block needing
 * review: `usualSetupNeedsReview` of the domain, answered in SQL. The two must
 * change together.
 */
export function ministryNeedsReview({
  client,
  churchId,
}: NeedsReviewConditionInput): SQL {
  return exists(
    client
      .select({ one: sql`1` })
      .from(usualSetup)
      .innerJoin(
        templateTimeBlock,
        and(
          eq(templateTimeBlock.id, usualSetup.sourceTemplateTimeBlockId),
          eq(templateTimeBlock.churchId, churchId),
        ),
      )
      .where(
        and(
          eq(usualSetup.ministryId, ministry.id),
          eq(usualSetup.churchId, churchId),
          eq(usualSetup.serves, true),
          sql`${usualSetup.shiftSplit} ->> 'kind' = 'manual'`,
          splitOverflowsBlock(),
        ),
      ),
  );
}

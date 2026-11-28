import { m } from '@church/i18n/messages';
import { pluralMessage } from '@/shared/utils/plural';

interface PublishGapsMessageInput {
  count: number;
}

/** What a publish confirmation says when `count` places are still open. */
export function publishGapsMessage({ count }: PublishGapsMessageInput) {
  return pluralMessage({
    count,
    one: () => m.prepare_publish_gaps_one({ count }),
    other: () => m.prepare_publish_gaps_other({ count }),
  });
}

/** What a publish confirmation says when `count` people have not answered. */
export function publishUnansweredMessage({ count }: PublishGapsMessageInput) {
  return pluralMessage({
    count,
    one: () => m.prepare_publish_unanswered_one({ count }),
    other: () => m.prepare_publish_unanswered_other({ count }),
  });
}

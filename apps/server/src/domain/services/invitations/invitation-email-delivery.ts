import type { InvitationEmailDelivery } from '../../entities/invitation-list-item';
import type { ProjectInvitationEmailDeliveryInput } from './invitation-email-delivery.types';

/**
 * The email fact of one outbox row. A Notification row settles `sent` even
 * when its email sink was skipped, so only the email sink's own outcome
 * proves a send; without one the fact is unavailable, never success.
 */
export function projectInvitationEmailDelivery({
  kind,
  status,
  channelOutcomes,
  sentAt,
  emailDeliveredAt,
}: ProjectInvitationEmailDeliveryInput): InvitationEmailDelivery {
  if (kind === 'notification') {
    const email = channelOutcomes?.email;
    if (email === 'delivered') {
      const at = emailDeliveredAt ?? sentAt;
      return at ? { state: 'sent', sentAt: at } : { state: 'sent' };
    }
    if (email === 'failed') return { state: 'failed' };
    if (email === 'skipped') return { state: 'unavailable' };
  }
  if (status === 'pending' || status === 'processing') {
    return { state: 'pending' };
  }
  if (status === 'failed') return { state: 'failed' };
  if (kind === 'notification') return { state: 'unavailable' };
  return sentAt ? { state: 'sent', sentAt } : { state: 'sent' };
}

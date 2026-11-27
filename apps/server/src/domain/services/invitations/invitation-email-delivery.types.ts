export interface ProjectInvitationEmailDeliveryInput {
  kind: 'invitation.chained' | 'invitation.church-bootstrap' | 'notification';
  status: 'pending' | 'processing' | 'sent' | 'failed';
  /** Per-sink outcomes of a `notification` row; keyed by sink name. */
  channelOutcomes?: Record<string, string> | null;
  sentAt?: Date | null;
  emailDeliveredAt?: Date | null;
}

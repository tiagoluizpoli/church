import type {
  EmailContent,
  EmailCredit,
  EmailIdentity,
} from '@/domain/contracts/infrastructure/email-layout';
import type {
  AvailabilityEmail,
  ChainedInvitationEmail,
  ChurchBootstrapInvitationEmail,
  ChurchOfferMinistryFacts,
  CycleReadyToPrepareEmail,
  EmailLocale,
  EmailPayload,
  EventCancelledEmail,
  EventChangedEmail,
  MinistryInvitationEmail,
  PasswordResetEmail,
  SchedulePublishedEmail,
  ScheduleUpdatedEmail,
  SwapRequestAnsweredEmail,
  SwapRequestEmail,
  TransferDigestEmail,
  VerificationCodeEmail,
} from '@/domain/contracts/infrastructure/email-sender';

export interface PrepareEmailFromInput {
  payload: EmailPayload;
  from: string;
  locale?: EmailLocale;
  /** Display name for app-branded kinds; injected from composition. */
  appName: string;
  platform?: PlatformBranding;
}

/** Platform assets the layout needs; both are absolute URLs. */
export interface PlatformBranding {
  logoUrl?: string;
  /** Where the "Enviado com {appName}" credit links; plain text when unset. */
  siteUrl?: string;
}

export interface PrepareLayoutEmailInput {
  payload: EmailPayload;
  locale: EmailLocale;
  /** The composed sender (see `emailSender`). */
  from: string;
  content: EmailContent;
  identity: EmailIdentity;
  credit?: EmailCredit;
}

export interface VerificationCodeContentInput {
  payload: VerificationCodeEmail;
  locale: EmailLocale;
}

export type MemberNotificationEmail =
  | MinistryInvitationEmail
  | AvailabilityEmail
  | SchedulePublishedEmail
  | ScheduleUpdatedEmail
  | SwapRequestEmail;

export interface MemberNotificationContentInput {
  payload: MemberNotificationEmail;
  locale: EmailLocale;
}

export interface AvailabilityFactLinesInput {
  payload: AvailabilityEmail;
  locale: EmailLocale;
}

export interface CycleReadyToPrepareContentInput {
  payload: CycleReadyToPrepareEmail;
  locale: EmailLocale;
}

export interface EventChangedContentInput {
  payload: EventChangedEmail;
  locale: EmailLocale;
}

export type EventMoveImpact = Extract<
  EventChangedEmail['change'],
  { kind: 'move' }
>['impacts'][number];

export interface EventMoveImpactLineInput {
  impact: EventMoveImpact;
  locale: EmailLocale;
}

export interface EventCancelledTitleInput {
  eventTitle: string;
  hidden?: boolean;
  eventTimeBlockId?: string;
  start: EventCancelledEmail['start'];
  churchTimezone: string;
  locale: EmailLocale;
}

export interface EventCancelledContentInput {
  payload: EventCancelledEmail;
  locale: EmailLocale;
}

export interface SwapRequestAnsweredContentInput {
  payload: SwapRequestAnsweredEmail;
  locale: EmailLocale;
}

export interface PasswordResetContentInput {
  payload: PasswordResetEmail;
  locale: EmailLocale;
  appName: string;
}

export interface InvitationContentInput {
  payload: ChainedInvitationEmail | ChurchBootstrapInvitationEmail;
  locale: EmailLocale;
}

export interface WithChurchPlaceInput {
  content: EmailContent;
  payload: { churchName: string; churchLocality?: string };
  locale: EmailLocale;
}

export interface MinistryOfferContentInput {
  offer: ChainedInvitationEmail | MinistryInvitationEmail;
  locale: EmailLocale;
}

export interface MinistryOfferLinesInput {
  offer: ChurchOfferMinistryFacts & { churchName: string };
  locale: EmailLocale;
}

export interface TransferDigestContentInput {
  payload: TransferDigestEmail;
  locale: EmailLocale;
}

import type {
  EmailDuration,
  EmailLocale,
} from '@/domain/contracts/infrastructure/email-sender';

/** One button; the layout also prints `url` as visible text. Callers compose
 * `url` from the configured web origin (escaping is not URL construction). */
export interface EmailAction {
  label: string;
  url: string;
}

/**
 * Semantic content every email kind supplies. Every value is plain text — the
 * layout alone adds markup and escapes each insertion exactly once.
 */
export interface EmailContent {
  subject: string;
  greeting: string;
  /** One line. */
  heading: string;
  /** One to three paragraphs. */
  facts: [string, ...string[]];
  list?: string[];
  action?: EmailAction;
  /** Why the recipient received this email. */
  footer: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Who the email says it is from: the header band and the plain-text first line. */
export interface EmailIdentity {
  displayName: string;
  /** Absolute URL; without it the band shows the name alone. */
  logoUrl?: string;
  /** `#rrggbb`; never drawn behind text beyond its 10% tint. */
  accent: string;
}

/** The muted "Enviado com {appName}" line; linked only when `siteUrl` is set. */
export interface EmailCredit {
  appName: string;
  siteUrl?: string;
}

export interface RenderEmailLayoutInput {
  content: EmailContent;
  locale: EmailLocale;
  identity: EmailIdentity;
  credit?: EmailCredit;
}

export interface FormatEmailDurationInput {
  duration: EmailDuration;
  locale: EmailLocale;
}

export interface PluralForInput {
  count: number;
  locale: EmailLocale;
}

export interface EmailSenderInput {
  /** Church name, or the app name for church-less email. */
  displayName: string;
  /** The configured sender, `Name <mailbox>` or a bare mailbox. */
  configuredFrom: string;
}

import { m } from '@church/i18n/messages';
import type {
  EmailDuration,
  EmailLocale,
} from '../../domain/contracts/infrastructure/email-sender';

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
  facts: [string] | [string, string] | [string, string, string];
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

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Interpolated facts are text, never markup. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** HTML and plain text from the same content; the text keeps raw values. */
export function renderEmailLayout({
  subject,
  greeting,
  heading,
  facts,
  list = [],
  action,
  footer,
}: EmailContent): RenderedEmail {
  const paragraph = (value: string) => `<p>${escapeHtml(value)}</p>`;
  const items = list.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const htmlBlocks = [
    paragraph(greeting),
    `<h1 style="font-size:20px">${escapeHtml(heading)}</h1>`,
    ...facts.map(paragraph),
    items ? `<ul>${items}</ul>` : '',
    action
      ? `<p><a href="${escapeHtml(action.url)}">${escapeHtml(action.label)}</a></p>${paragraph(action.url)}`
      : '',
    `<hr><p style="color:#666;font-size:12px">${escapeHtml(footer)}</p>`,
  ];
  const textBlocks = [
    greeting,
    heading,
    ...facts,
    list.map((item) => `- ${item}`).join('\n'),
    action ? `${action.label}: ${action.url}` : '',
    `--\n${footer}`,
  ];
  return {
    subject,
    html: `<!doctype html><html><body style="font-family:sans-serif">${htmlBlocks.filter(Boolean).join('\n')}</body></html>`,
    text: textBlocks.filter(Boolean).join('\n\n'),
  };
}

export interface FormatEmailDurationInput {
  duration: EmailDuration;
  locale: EmailLocale;
}

/** A policy duration in catalog words, pluralized by the locale's rules. */
export function formatEmailDuration({
  duration,
  locale,
}: FormatEmailDurationInput): string {
  const { minutes: count } = duration;
  const plural = new Intl.PluralRules(locale).select(count);
  return plural === 'one'
    ? m.email_duration_minutes_one({ count }, { locale })
    : m.email_duration_minutes_other({ count }, { locale });
}

export interface EmailSenderInput {
  /** Church name, or the app name for church-less email. */
  displayName: string;
  /** The configured sender, `Name <mailbox>` or a bare mailbox. */
  configuredFrom: string;
}

const CONTROL_CHARACTERS = /\p{Cc}+/gu;
const QUOTED_SPECIALS = /["\\]/g;

/**
 * `"Display Name" <configured mailbox>`. The name is an RFC 5322 quoted
 * string, so commas, angle brackets or quotes in it never add a recipient or
 * header; line breaks are flattened.
 */
export function emailSender({
  displayName,
  configuredFrom,
}: EmailSenderInput): string {
  const configuredMailbox = /<([^<>]+)>\s*$/.exec(configuredFrom)?.[1];
  const mailbox = (configuredMailbox ?? configuredFrom).trim();
  const name = displayName.replace(CONTROL_CHARACTERS, ' ').trim();
  if (!name) return mailbox;
  return `"${name.replace(QUOTED_SPECIALS, '\\$&')}" <${mailbox}>`;
}

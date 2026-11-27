import {
  EMAIL_INK,
  EMAIL_LOGO_MAX_HEIGHT,
  EMAIL_LOGO_MAX_WIDTH,
  EMAIL_LOGO_RADIUS,
  EMAIL_RULE_WIDTH,
  emailAccentRule,
  emailAccentTint,
} from '@church/domain-rules/email-accent';
import { m } from '@church/i18n/messages';
import type {
  EmailSenderInput,
  FormatEmailDurationInput,
  PluralForInput,
  RenderEmailLayoutInput,
  RenderedEmail,
} from '../../domain/contracts/infrastructure/email-layout';

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

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = EMAIL_INK;
const BODY = '#3f3f46';
const MUTED = '#71717a';
const LINE = '#e4e4e7';
const CANVAS = '#f8f8f7';
const PANEL = '#fafafa';

/**
 * HTML and plain text from the same content (variant C · Faixa); the text
 * keeps raw values. One designed layout for every kind.
 */
export function renderEmailLayout({
  content: { subject, greeting, heading, facts, list = [], action, footer },
  locale,
  identity: { displayName, logoUrl, accent },
  credit,
}: RenderEmailLayoutInput): RenderedEmail {
  const options = { locale };
  const rule = emailAccentRule(accent);
  const tint = emailAccentTint(accent);
  const paragraph = (value: string) =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BODY}">${escapeHtml(value)}</p>`;
  const logo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(displayName)}" style="display:block;margin:0 auto 12px;border:0;max-height:${EMAIL_LOGO_MAX_HEIGHT}px;max-width:${EMAIL_LOGO_MAX_WIDTH}px;border-radius:${EMAIL_LOGO_RADIUS}px">`
    : '';
  const nameStyle = logoUrl
    ? 'font-size:14px;font-weight:600'
    : 'font-size:20px;font-weight:700';
  const detailRows = list
    .map(
      (item) =>
        `<tr><td style="padding:6px 18px;font-size:15px;line-height:1.5;color:${INK}">${escapeHtml(item)}</td></tr>`,
    )
    .join('');
  const details = list.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background:${PANEL};border:1px solid ${LINE};border-radius:8px"><tr><td style="padding:14px 18px 4px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">${escapeHtml(m.email_layout_details({}, options))}</td></tr>${detailRows}<tr><td style="height:10px;line-height:10px">&nbsp;</td></tr></table>`
    : '';
  const button = action
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 12px"><tr><td align="center" bgcolor="#ffffff" style="border:2px solid ${rule};border-radius:999px"><a href="${escapeHtml(action.url)}" style="display:block;padding:13px 24px;font-size:16px;font-weight:700;color:${INK};text-decoration:none;text-align:center">${escapeHtml(action.label)}</a></td></tr></table><p style="margin:0 0 4px;font-size:12px;line-height:1.5;color:${MUTED};text-align:center;word-break:break-all">${escapeHtml(action.url)}</p>`
    : '';
  const creditText = credit
    ? m.email_layout_credit({ appName: credit.appName }, options)
    : '';
  const creditHtml = credit
    ? `<p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:${MUTED}">${
        credit.siteUrl
          ? `<a href="${escapeHtml(credit.siteUrl)}" style="color:${MUTED};text-decoration:underline">${escapeHtml(creditText)}</a>`
          : escapeHtml(creditText)
      }</p>`
    : '';
  const preheader = facts[0];
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${CANVAS};-webkit-text-size-adjust:100%;color-scheme:light only">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CANVAS}" style="background:${CANVAS}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;font-family:${FONT_STACK}">
<tr><td align="center" bgcolor="${tint}" style="background:${tint};border-top:${EMAIL_RULE_WIDTH}px solid ${rule};border-radius:10px 10px 0 0;padding:28px 24px;text-align:center">${logo}<div style="${nameStyle};color:${INK};line-height:1.3">${escapeHtml(displayName)}</div></td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${LINE};border-top:0;border-radius:0 0 10px 10px;padding:32px 32px 28px">
<p style="margin:0 0 6px;font-size:14px;line-height:1.5;color:${MUTED};text-align:center">${escapeHtml(greeting)}</p>
<h1 style="margin:0 0 24px;font-size:24px;line-height:1.3;font-weight:800;color:${INK};text-align:center">${escapeHtml(heading)}</h1>
${facts.map(paragraph).join('')}${details}${button}
</td></tr>
<tr><td style="padding:20px 24px 0;text-align:center"><p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED}">${escapeHtml(footer)}</p>${creditHtml}</td></tr>
</table></td></tr></table></body></html>`;
  const textBlocks = [
    displayName,
    greeting,
    heading,
    ...facts,
    list.map((item) => `- ${item}`).join('\n'),
    action ? `${action.label}: ${action.url}` : '',
    `--\n${footer}`,
    credit ? [creditText, credit.siteUrl].filter(Boolean).join(': ') : '',
  ];
  return { subject, html, text: textBlocks.filter(Boolean).join('\n\n') };
}

/** A policy duration in catalog words, pluralized by the locale's rules. */
export function formatEmailDuration({
  duration,
  locale,
}: FormatEmailDurationInput): string {
  const options = { locale };
  if ('hours' in duration) {
    const { hours: count } = duration;
    return pluralFor({ count, locale }) === 'one'
      ? m.email_duration_hours_one({ count }, options)
      : m.email_duration_hours_other({ count }, options);
  }
  if ('days' in duration) {
    const { days: count } = duration;
    return pluralFor({ count, locale }) === 'one'
      ? m.email_duration_days_one({ count }, options)
      : m.email_duration_days_other({ count }, options);
  }
  const { minutes: count } = duration;
  return pluralFor({ count, locale }) === 'one'
    ? m.email_duration_minutes_one({ count }, options)
    : m.email_duration_minutes_other({ count }, options);
}

function pluralFor({ count, locale }: PluralForInput): Intl.LDMLPluralRule {
  return new Intl.PluralRules(locale).select(count);
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

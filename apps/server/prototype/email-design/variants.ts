// PROTOTYPE (#989 Email design standard): three structurally different layouts. Throwaway.

import { APP_NAME, type Identity, type Logo, PLATFORM_SITE } from './samples';
import {
  type EmailContent,
  escapeHtml as e,
} from '@/infrastructure/services/email-layout';

export interface RenderInput {
  content: EmailContent;
  /** null = platform-branded (password reset): app name + platform logo, no credit. */
  identity: Identity | null;
  platformLogo: Logo;
  origin: string;
}

// ---------- colour helpers (the real spec decides these rules) ----------
const rgb = (hex: string) =>
  [1, 3, 5].map((n) => Number.parseInt(hex.slice(n, n + 2), 16));
const toHex = (c: number[]) =>
  `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** Text on the accent: whichever of near-black / white reads better. */
export const textOn = (accent: string) =>
  contrast(accent, '#ffffff') >= contrast(accent, '#18181b')
    ? '#ffffff'
    : '#18181b';
/** The accent as a line on white: darkened until it reaches 3:1. */
export const ruleOn = (accent: string) => {
  let c = rgb(accent);
  while (contrast(toHex(c), '#ffffff') < 3) c = c.map((v) => v * 0.9);
  return toHex(c);
};
const tint = (accent: string, amount: number) =>
  toHex(rgb(accent).map((v) => 255 - (255 - v) * amount));

// ---------- shared bits ----------
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = '#18181b';
const BODY = '#3f3f46';
const MUTED = '#71717a';
const LINE = '#e4e4e7';
const PLATFORM_ACCENT = '#18181b';

function logoImg(
  logo: Logo,
  alt: string,
  origin: string,
  maxH = 48,
  maxW = 192,
) {
  const ratio = logo.width / logo.height;
  const w = Math.round(Math.min(maxW, maxH * ratio));
  const h = Math.round(w / ratio);
  return `<img src="${origin}${logo.path}" width="${w}" height="${h}" alt="${e(alt)}" style="display:block;border:0;outline:none;width:${w}px;height:${h}px">`;
}

function brand(input: RenderInput) {
  const { identity, platformLogo } = input;
  if (!identity)
    return {
      name: APP_NAME,
      logo: platformLogo,
      accent: PLATFORM_ACCENT,
      church: false,
    };
  return {
    name: identity.churchName,
    logo: identity.logo,
    accent: identity.accent,
    church: true,
  };
}

function shell(subject: string, preheader: string, bg: string, inner: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:${bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${e(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${bg}" style="background:${bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;font-family:${FONT}">${inner}</table>
</td></tr></table></body></html>`;
}

function credit(church: boolean, align: string) {
  if (!church) return '';
  return `<p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:#a1a1aa;text-align:${align}">Enviado com <a href="${PLATFORM_SITE}" style="color:#a1a1aa;text-decoration:underline">${e(APP_NAME)}</a></p>`;
}

const p = (text: string, style: string) =>
  `<p style="margin:0 0 16px;${style}">${e(text)}</p>`;

// ---------- A · Cartão: card on a grey canvas, accent top rule, filled accent button ----------
export function variantA(input: RenderInput) {
  const { content: c, origin } = input;
  const b = brand(input);
  const header = b.logo
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:12px;vertical-align:middle">${logoImg(b.logo, b.name, origin, 40, 160)}</td><td style="vertical-align:middle;font-size:15px;font-weight:600;color:${INK}">${e(b.name)}</td></tr></table>`
    : `<div style="font-size:18px;font-weight:700;color:${INK};line-height:1.3">${e(b.name)}</div>`;
  const list = c.list?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-top:1px solid ${LINE}">${c.list
        .map(
          (item) =>
            `<tr><td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:15px;line-height:1.5;color:${INK}">${e(item)}</td></tr>`,
        )
        .join('')}</table>`
    : '';
  const action = c.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px"><tr><td bgcolor="${b.accent}" style="border-radius:6px;background:${b.accent}"><a href="${e(c.action.url)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:${textOn(b.accent)};text-decoration:none;border-radius:6px">${e(c.action.label)}</a></td></tr></table>
<p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:${MUTED}">Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${e(c.action.url)}" style="color:${MUTED};word-break:break-all">${e(c.action.url)}</a></p>`
    : '';
  const inner = `<tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:8px;border-top:4px solid ${ruleOn(b.accent)};padding:28px 32px">
${header}
<div style="height:24px;line-height:24px">&nbsp;</div>
${p(c.greeting, `font-size:15px;line-height:1.6;color:${MUTED}`)}
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:${INK}">${e(c.heading)}</h1>
${c.facts.map((f) => p(f, `font-size:15px;line-height:1.6;color:${BODY}`)).join('')}
${list}${action}
</td></tr>
<tr><td style="padding:20px 32px 0;text-align:center"><p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED}">${e(c.footer)}</p>${credit(b.church, 'center')}</td></tr>`;
  return shell(c.subject, c.facts[0], '#f4f4f5', inner);
}

// ---------- B · Carta: white letter, no card, left-aligned, neutral button with accent edge ----------
export function variantB(input: RenderInput) {
  const { content: c, origin } = input;
  const b = brand(input);
  const header = b.logo
    ? `${logoImg(b.logo, b.name, origin)}<div style="margin-top:10px;font-size:13px;font-weight:600;letter-spacing:.02em;color:${MUTED}">${e(b.name)}</div>`
    : `<div style="font-size:20px;font-weight:700;color:${INK};line-height:1.3">${e(b.name)}</div>`;
  const list = c.list?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px">${c.list
        .map(
          (item) =>
            `<tr><td width="14" style="vertical-align:top;padding:4px 0;font-size:16px;line-height:1.6;color:${ruleOn(b.accent)}">&#8226;</td><td style="padding:4px 0;font-size:16px;line-height:1.6;color:${BODY}">${e(item)}</td></tr>`,
        )
        .join('')}</table>`
    : '';
  const action = c.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 12px"><tr><td bgcolor="${INK}" style="background:${INK};border-left:4px solid ${ruleOn(b.accent)};border-radius:4px"><a href="${e(c.action.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${e(c.action.label)} &rarr;</a></td></tr></table>
<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:${MUTED}"><a href="${e(c.action.url)}" style="color:${MUTED};word-break:break-all">${e(c.action.url)}</a></p>`
    : '';
  const inner = `<tr><td style="padding:8px 8px 20px;border-bottom:2px solid ${ruleOn(b.accent)}">${header}</td></tr>
<tr><td style="padding:28px 8px 8px">
${p(c.greeting, `font-size:16px;line-height:1.6;color:${BODY}`)}
<h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:400;color:${INK}">${e(c.heading)}</h1>
${c.facts.map((f) => p(f, `font-size:16px;line-height:1.6;color:${BODY}`)).join('')}
${list}${action}
</td></tr>
<tr><td style="padding:20px 8px 0;border-top:1px solid ${LINE}"><p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED}">${e(c.footer)}</p>${credit(b.church, 'left')}</td></tr>`;
  return shell(c.subject, c.facts[0], '#ffffff', inner);
}

// ---------- C · Faixa: tinted header band, centred identity and heading, details panel, outlined full-width button ----------
export function variantC(input: RenderInput) {
  const { content: c, origin } = input;
  const b = brand(input);
  const rule = ruleOn(b.accent);
  const header = `${b.logo ? `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 12px"><tr><td>${logoImg(b.logo, b.name, origin, 56, 200)}</td></tr></table>` : ''}<div style="font-size:${b.logo ? 14 : 20}px;font-weight:${b.logo ? 600 : 700};color:${INK};line-height:1.3">${e(b.name)}</div>`;
  const list = c.list?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background:#fafafa;border:1px solid ${LINE};border-radius:8px"><tr><td style="padding:14px 18px 4px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">Detalhes</td></tr>${c.list
        .map(
          (item) =>
            `<tr><td style="padding:6px 18px;font-size:15px;line-height:1.5;color:${INK}">${e(item)}</td></tr>`,
        )
        .join(
          '',
        )}<tr><td style="height:10px;line-height:10px">&nbsp;</td></tr></table>`
    : '';
  const action = c.action
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 12px"><tr><td align="center" bgcolor="#ffffff" style="border:2px solid ${rule};border-radius:999px"><a href="${e(c.action.url)}" style="display:block;padding:13px 24px;font-size:16px;font-weight:700;color:${INK};text-decoration:none;text-align:center">${e(c.action.label)}</a></td></tr></table>
<p style="margin:0 0 4px;font-size:12px;line-height:1.5;color:${MUTED};text-align:center"><a href="${e(c.action.url)}" style="color:${MUTED};word-break:break-all">${e(c.action.url)}</a></p>`
    : '';
  const inner = `<tr><td align="center" bgcolor="${tint(b.accent, 0.1)}" style="background:${tint(b.accent, 0.1)};border-top:6px solid ${rule};border-radius:10px 10px 0 0;padding:28px 24px;text-align:center">${header}</td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${LINE};border-top:0;border-radius:0 0 10px 10px;padding:32px 32px 28px">
<p style="margin:0 0 6px;font-size:14px;line-height:1.5;color:${MUTED};text-align:center">${e(c.greeting)}</p>
<h1 style="margin:0 0 24px;font-size:24px;line-height:1.3;font-weight:800;color:${INK};text-align:center">${e(c.heading)}</h1>
${c.facts.map((f) => p(f, `font-size:15px;line-height:1.65;color:${BODY}`)).join('')}
${list}${action}
</td></tr>
<tr><td style="padding:20px 24px 0;text-align:center"><p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED}">${e(c.footer)}</p>${credit(b.church, 'center')}</td></tr>`;
  return shell(c.subject, c.facts[0], '#f8f8f7', inner);
}

/** Plain text is not a design question: identity line first, then the content. */
export function textVersion({ content: c, identity }: RenderInput) {
  return [
    identity ? identity.churchName : APP_NAME,
    c.greeting,
    c.heading,
    ...c.facts,
    (c.list ?? []).map((item) => `- ${item}`).join('\n'),
    c.action ? `${c.action.label}: ${c.action.url}` : '',
    `--\n${c.footer}`,
    identity ? `Enviado com ${APP_NAME} (${PLATFORM_SITE})` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export const variants = {
  A: { name: 'Cartão', render: variantA },
  B: { name: 'Carta', render: variantB },
  C: { name: 'Faixa', render: variantC },
} as const;

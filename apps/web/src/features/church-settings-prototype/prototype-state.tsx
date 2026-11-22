// PROTOTYPE, throwaway: Church Settings screen (wayfinder #980). In-memory state only, no API.
import * as React from 'react';

export type ContactKind = 'email' | 'phone';

export interface Contact {
  id: string;
  kind: ContactKind;
  value: string;
  label: string;
  isWhatsApp: boolean;
  isPublic: boolean;
  groupId: string | null;
}

export interface LinkGroup {
  id: string;
  name: string;
}

export interface SocialLink {
  id: string;
  url: string;
  label: string;
  groupId: string | null;
}

export interface LegalProfile {
  legalName: string;
  cnpj: string;
  isPublic: boolean;
}

export interface SettingsForm {
  name: string;
  slug: string;
  website: string;
  accent: string | null;
  contacts: Contact[];
  groups: LinkGroup[];
  links: SocialLink[];
  legal: LegalProfile;
}

export type Errors = Record<string, string>;

let seq = 100;
export const newId = () => `p${seq++}`;

export const FILLED: SettingsForm = {
  name: 'Igreja Batista Esperança',
  slug: 'ib-esperanca',
  website: 'https://ibesperanca.org.br',
  accent: '#1d4ed8',
  contacts: [
    {
      id: 'c1',
      kind: 'phone',
      value: '+55 11 3456-7890',
      label: 'Secretaria',
      isWhatsApp: false,
      isPublic: true,
      groupId: null,
    },
    {
      id: 'c2',
      kind: 'phone',
      value: '+55 11 98765-4321',
      label: 'Celular',
      isWhatsApp: true,
      isPublic: true,
      groupId: 'g1',
    },
    {
      id: 'c3',
      kind: 'email',
      value: 'contato@ibesperanca.org.br',
      label: '',
      isWhatsApp: false,
      isPublic: true,
      groupId: null,
    },
    {
      id: 'c4',
      kind: 'email',
      value: 'louvor@ibesperanca.org.br',
      label: '',
      isWhatsApp: false,
      isPublic: false,
      groupId: 'g2',
    },
  ],
  groups: [
    { id: 'g1', name: 'Pastor Marcos' },
    { id: 'g2', name: 'Ministério de louvor' },
  ],
  links: [
    {
      id: 'l1',
      url: 'https://instagram.com/ibesperanca',
      label: '',
      groupId: null,
    },
    {
      id: 'l2',
      url: 'https://youtube.com/@ibesperanca',
      label: 'Cultos ao vivo',
      groupId: null,
    },
    {
      id: 'l3',
      url: 'https://instagram.com/prmarcos',
      label: '',
      groupId: 'g1',
    },
    {
      id: 'l4',
      url: 'https://open.spotify.com/show/abc',
      label: 'Podcast',
      groupId: 'g1',
    },
    {
      id: 'l5',
      url: 'https://youtube.com/@louvoresperanca',
      label: '',
      groupId: 'g2',
    },
  ],
  legal: {
    legalName: 'Igreja Batista Esperança de São Paulo',
    cnpj: '12.345.678/0001-95',
    isPublic: false,
  },
};

export const EMPTY: SettingsForm = {
  name: 'Igreja Batista Esperança',
  slug: 'igreja-batista-esperanca',
  website: '',
  accent: null,
  contacts: [],
  groups: [],
  links: [],
  legal: { legalName: '', cnpj: '', isPublic: false },
};

export const ACCENT_PRESETS = [
  '#1d4ed8',
  '#0f766e',
  '#15803d',
  '#a16207',
  '#c2410c',
  '#b91c1c',
  '#be185d',
  '#7e22ce',
  '#4338ca',
  '#334155',
];

// One data table + one pure function, as decided in "Church Settings fields and validation".
const NETWORKS: { name: string; hosts: string[]; path?: RegExp }[] = [
  { name: 'Instagram', hosts: ['instagram.com'] },
  { name: 'YouTube', hosts: ['youtube.com', 'youtu.be'] },
  { name: 'Facebook', hosts: ['facebook.com', 'fb.com'] },
  { name: 'TikTok', hosts: ['tiktok.com'] },
  { name: 'Spotify', hosts: ['open.spotify.com', 'spotify.com'] },
  { name: 'X', hosts: ['x.com', 'twitter.com'] },
  { name: 'Threads', hosts: ['threads.net', 'threads.com'] },
  { name: 'Telegram', hosts: ['t.me'] },
  { name: 'WhatsApp', hosts: ['whatsapp.com'], path: /^\/channel\// },
  { name: 'WhatsApp', hosts: ['chat.whatsapp.com'] },
  { name: 'LinkedIn', hosts: ['linkedin.com'] },
  { name: 'Apple Podcasts', hosts: ['podcasts.apple.com'] },
  { name: 'Deezer', hosts: ['deezer.com'] },
  { name: 'Kwai', hosts: ['kwai.com'] },
];

export type Detection = { network: string } | { error: string } | null;

export function detectNetwork(raw: string): Detection {
  if (!raw.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    return { error: 'Endereço inválido' };
  }
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
  if (host === 'wa.me')
    return { error: 'Isto é um número: adicione como Contato' };
  const hit = NETWORKS.find(
    (n) => n.hosts.includes(host) && (!n.path || n.path.test(url.pathname)),
  );
  return hit
    ? { network: hit.name }
    : { error: 'Rede não suportada, fale com o suporte' };
}

export const slugify = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 63);

export const textOn = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? '#ffffff' : '#111111';
};

// Stands in for the server's one shared schema: what a failing single save would hand back, keyed per field.
export function simulatedServerErrors(form: SettingsForm): Errors {
  const errors: Errors = {};
  if (!form.name.trim()) errors.name = 'Informe o nome da igreja';
  const phone = form.contacts.find((c) => c.kind === 'phone');
  if (phone)
    errors[`contacts.${phone.id}.value`] = 'Número inválido para o Brasil';
  const email = form.contacts.find((c) => c.kind === 'email');
  if (email) errors[`contacts.${email.id}.value`] = 'E-mail inválido';
  const link = form.links.at(-1);
  if (link)
    errors[`links.${link.id}.url`] = 'Rede não suportada, fale com o suporte';
  if (form.legal.cnpj)
    errors['legal.cnpj'] = 'Este CNPJ já está cadastrado; fale com o suporte';
  return errors;
}

export function move<T>(list: T[], index: number, delta: number): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item as T);
  return next;
}

export interface SettingsController {
  form: SettingsForm;
  saved: SettingsForm;
  setForm: React.Dispatch<React.SetStateAction<SettingsForm>>;
  patch: (p: Partial<SettingsForm>) => void;
  dirty: boolean;
  errors: Errors;
  errorCount: number;
  logo: string | null;
  setLogo: (url: string | null) => void;
  save: () => void;
  discard: () => void;
  simulateErrors: () => void;
  pendingSlugConfirm: boolean;
  confirmSlug: (ok: boolean) => void;
  log: string[];
}

export function useSettingsController(
  initial: SettingsForm,
): SettingsController {
  const [saved, setSaved] = React.useState(initial);
  const [form, setForm] = React.useState(initial);
  const [errors, setErrors] = React.useState<Errors>({});
  const [logo, setLogoState] = React.useState<string | null>(
    initial === FILLED ? 'demo' : null,
  );
  const [pendingSlugConfirm, setPendingSlugConfirm] = React.useState(false);
  const [log, setLog] = React.useState<string[]>([]);
  const push = (line: string) =>
    setLog((l) =>
      [`${new Date().toLocaleTimeString()} ${line}`, ...l].slice(0, 6),
    );

  React.useEffect(() => {
    setSaved(initial);
    setForm(initial);
    setErrors({});
    setLogoState(initial === FILLED ? 'demo' : null);
  }, [initial]);

  const commit = () => {
    setSaved(form);
    setErrors({});
    push('PUT /church-settings → 200 (tudo salvo de uma vez)');
  };

  return {
    form,
    saved,
    setForm,
    patch: (p) => setForm((f) => ({ ...f, ...p })),
    dirty: JSON.stringify(form) !== JSON.stringify(saved),
    errors,
    errorCount: Object.keys(errors).length,
    logo,
    setLogo: (url) => {
      setLogoState(url);
      push(
        url
          ? 'PUT /church-settings/logo → 200 (aplicado na hora)'
          : 'DELETE /church-settings/logo → 204',
      );
    },
    save: () => {
      if (form.slug !== saved.slug) {
        setPendingSlugConfirm(true);
        return;
      }
      commit();
    },
    discard: () => {
      setForm(saved);
      setErrors({});
    },
    simulateErrors: () => {
      setErrors(simulatedServerErrors(form));
      push('PUT /church-settings → 422 (erros por campo)');
    },
    pendingSlugConfirm,
    confirmSlug: (ok) => {
      setPendingSlugConfirm(false);
      if (ok) commit();
    },
    log,
  };
}

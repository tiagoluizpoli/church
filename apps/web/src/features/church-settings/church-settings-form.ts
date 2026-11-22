import type { GetChurchSettings200 } from '@/infrastructure/api/churchAPI.schemas';

/** What the screen edits; the server normalises it on save. */
export interface ChurchSettingsForm {
  name: string;
  /** Empty means no website. */
  website: string;
  /** `null` means "Padrão do app". */
  accentColor: string | null;
}

interface ToChurchSettingsFormInput {
  settings: Pick<GetChurchSettings200, 'name' | 'website' | 'accentColor'>;
}

export function toChurchSettingsForm({
  settings,
}: ToChurchSettingsFormInput): ChurchSettingsForm {
  return {
    name: settings.name,
    website: settings.website ?? '',
    accentColor: settings.accentColor,
  };
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

interface IsHexColorInput {
  value: string | null;
}

/** The typed accent when it is a complete `#rrggbb`, safe to paint with; otherwise `null`. */
export function paintableAccent({ value }: IsHexColorInput): string | null {
  return value !== null && HEX_COLOR.test(value) ? value : null;
}

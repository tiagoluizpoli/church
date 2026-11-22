import { m } from '@church/i18n/messages';
import { Building2, FileText } from 'lucide-react';
import { IconInputField } from '@/components/icon-input-field';
import { Switch } from '@/components/ui/switch';
import type { LegalProfileDraft } from '@/features/church-settings/church-settings-form';

type FieldErrors = Record<string, string>;

interface LegalSectionProps {
  profile: LegalProfileDraft;
  errors: FieldErrors;
  onChange: (profile: LegalProfileDraft) => void;
}

/** The Church Legal Profile: razão social, CNPJ and the one *Público* toggle, off by default. */
export function LegalSection({ profile, errors, onChange }: LegalSectionProps) {
  const set = (changes: Partial<LegalProfileDraft>) =>
    onChange({ ...profile, ...changes });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <IconInputField
          icon={Building2}
          label={m.church_settings_legal_name_label()}
          value={profile.legalName}
          error={errors['legalProfile.legalName']}
          onChange={(event) => set({ legalName: event.target.value })}
        />
        <IconInputField
          icon={FileText}
          label={m.church_settings_legal_cnpj_label()}
          hint={m.church_settings_legal_cnpj_hint()}
          inputMode="numeric"
          value={profile.cnpj}
          error={errors['legalProfile.cnpj']}
          onChange={(event) => set({ cnpj: event.target.value })}
        />
      </div>
      <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border p-3">
        <span className="min-w-0">
          <span className="block font-medium text-sm">
            {m.church_settings_legal_public_label()}
          </span>
          <span className="block font-normal text-muted-foreground text-sm">
            {m.church_settings_legal_public_hint()}
          </span>
        </span>
        <Switch
          aria-label={m.church_settings_legal_public_toggle()}
          checked={profile.isPublic}
          onCheckedChange={(isPublic) => set({ isPublic })}
        />
      </div>
    </div>
  );
}

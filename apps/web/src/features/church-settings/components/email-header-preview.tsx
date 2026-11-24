import {
  EMAIL_INK,
  EMAIL_LOGO_RADIUS,
  EMAIL_RULE_WIDTH,
  emailAccentRule,
  emailAccentTint,
  PLATFORM_ACCENT,
} from '@church/domain-rules/email-accent';
import { m } from '@church/i18n/messages';
import { paintableAccent } from '@/features/church-settings/church-settings-form';
import { cn } from '@/lib/utils';

interface EmailHeaderPreviewProps {
  name: string;
  /** May be a data URL (a logo not uploaded yet); `null` shows the name alone. */
  logoUrl: string | null;
  /** The form's accent; unset or invalid falls back to the platform accent, like the email. */
  accentColor: string | null;
}

/** The header of the real email: centred logo above the name, on the accent tint under its top rule. */
export function EmailHeaderPreview({
  name,
  logoUrl,
  accentColor,
}: EmailHeaderPreviewProps) {
  const accent = paintableAccent({ value: accentColor }) ?? PLATFORM_ACCENT;
  return (
    <div
      data-testid="church-preview-email-band"
      className="flex flex-col items-center gap-3 px-6 py-7 text-center"
      style={{
        background: emailAccentTint(accent),
        borderTop: `${EMAIL_RULE_WIDTH}px solid ${emailAccentRule(accent)}`,
        color: EMAIL_INK,
      }}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={m.church_settings_logo_alt()}
          className="max-h-14 max-w-48 object-contain"
          style={{ borderRadius: EMAIL_LOGO_RADIUS }}
        />
      ) : null}
      {name ? (
        <p
          className={cn(
            'min-w-0 max-w-full truncate',
            logoUrl ? 'font-semibold text-sm' : 'font-bold text-xl',
          )}
        >
          {name}
        </p>
      ) : null}
    </div>
  );
}

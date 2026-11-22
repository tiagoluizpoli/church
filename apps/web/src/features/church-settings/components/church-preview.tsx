import { m } from '@church/i18n/messages';
import { accentTextColor } from '@/features/church-settings/accent-text-color';
import {
  type ChurchSettingsForm,
  paintableAccent,
} from '@/features/church-settings/church-settings-form';

interface ChurchPreviewProps {
  form: ChurchSettingsForm;
  /** Set when the preview names itself (beside the sections); the drawer names it instead. */
  titleId?: string;
}

/** "Como sua igreja aparece": the public face as the form stands, empty fields left out. */
export function ChurchPreview({ form, titleId }: ChurchPreviewProps) {
  const accent = paintableAccent({ value: form.accentColor });
  const band = accent
    ? { background: accent, color: accentTextColor({ accentColor: accent }) }
    : undefined;
  const website = form.website.trim().replace(/^https?:\/\//i, '');
  const name = form.name.trim();
  return (
    <div className="overflow-hidden rounded-xl border bg-background">
      {titleId ? (
        <h2 id={titleId} className="border-b px-4 py-3 font-semibold text-base">
          {m.church_settings_preview_title()}
        </h2>
      ) : null}
      <div
        className={
          accent
            ? 'flex items-center gap-3 p-4'
            : 'flex items-center gap-3 bg-primary p-4 text-primary-foreground'
        }
        style={band}
      >
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-md bg-background/90 font-semibold text-foreground"
        >
          {name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          {name ? <p className="truncate font-semibold">{name}</p> : null}
          {website ? (
            <p className="truncate text-sm opacity-90">{website}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

import { m } from '@church/i18n/messages';
import { Check, Hash } from 'lucide-react';
import { IconInput } from '@/components/icon-input-field';
import { Button } from '@/components/ui/button';
import { accentTextColor } from '@/features/church-settings/accent-text-color';
import { paintableAccent } from '@/features/church-settings/church-settings-form';
import { cn } from '@/lib/utils';

interface Swatch {
  hex: string;
  name: () => string;
}

const SWATCHES: Swatch[] = [
  { hex: '#1d4ed8', name: () => m.church_settings_swatch_blue() },
  { hex: '#0f766e', name: () => m.church_settings_swatch_teal() },
  { hex: '#15803d', name: () => m.church_settings_swatch_green() },
  { hex: '#a16207', name: () => m.church_settings_swatch_mustard() },
  { hex: '#c2410c', name: () => m.church_settings_swatch_orange() },
  { hex: '#b91c1c', name: () => m.church_settings_swatch_red() },
  { hex: '#be185d', name: () => m.church_settings_swatch_pink() },
  { hex: '#7e22ce', name: () => m.church_settings_swatch_purple() },
  { hex: '#4338ca', name: () => m.church_settings_swatch_indigo() },
  { hex: '#334155', name: () => m.church_settings_swatch_graphite() },
];

const COLOR_INPUT_FALLBACK = '#1d4ed8';

interface AccentPickerProps {
  value: string | null;
  error?: string;
  /** 44 px swatches on touch screens. */
  touch: boolean;
  onChange: (value: string | null) => void;
}

/** "Padrão do app", ten named swatches, or any custom `#rrggbb`. */
export function AccentPicker({
  value,
  error,
  touch,
  onChange,
}: AccentPickerProps) {
  const swatchSize = touch ? 'size-11' : 'size-9';
  const selected = value?.toLowerCase() ?? null;
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 font-medium text-sm">
        {m.church_settings_accent_label()}
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          aria-pressed={selected === null}
          onClick={() => onChange(null)}
          className={cn(
            selected === null &&
              'ring-2 ring-ring ring-offset-2 ring-offset-background',
          )}
        >
          {m.church_settings_accent_default()}
        </Button>
        {SWATCHES.map((swatch) => (
          <button
            key={swatch.hex}
            type="button"
            aria-label={swatch.name()}
            aria-pressed={selected === swatch.hex}
            title={swatch.name()}
            onClick={() => onChange(swatch.hex)}
            className={cn(
              swatchSize,
              'flex items-center justify-center rounded-md border border-black/10 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            )}
            style={{
              background: swatch.hex,
              color: accentTextColor({ accentColor: swatch.hex }),
            }}
          >
            {selected === swatch.hex ? (
              <Check className="size-4" aria-hidden />
            ) : null}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={m.church_settings_accent_custom()}
          className={cn(
            swatchSize,
            'cursor-pointer rounded-md border bg-transparent p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
          value={paintableAccent({ value }) ?? COLOR_INPUT_FALLBACK}
          onChange={(event) => onChange(event.target.value)}
        />
        <IconInput
          icon={Hash}
          wrapperClassName="w-36"
          aria-label={m.church_settings_accent_hex()}
          aria-invalid={error ? true : undefined}
          aria-describedby="church-settings-accent-description"
          className="font-mono"
          placeholder={m.church_settings_accent_hex_placeholder()}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value.trim() || null)}
        />
      </div>
      <p
        id="church-settings-accent-description"
        className={cn(
          'text-pretty text-sm',
          error ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {error ?? m.church_settings_accent_hint()}
      </p>
    </fieldset>
  );
}

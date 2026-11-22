import { m } from '@church/i18n/messages';
import { cn } from '@/lib/utils';

interface LogoImageProps {
  logoUrl: string | null;
  className?: string;
}

/** The Church logo scaled to fit, never cropped or stretched; a dashed "Sem logo" without one. */
export function LogoImage({ logoUrl, className }: LogoImageProps) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={m.church_settings_logo_alt()}
        className={cn('object-contain', className)}
      />
    );
  }
  return (
    <span
      className={cn(
        'flex items-center justify-center rounded-md border border-dashed text-muted-foreground text-xs',
        className,
      )}
    >
      {m.church_settings_logo_none()}
    </span>
  );
}

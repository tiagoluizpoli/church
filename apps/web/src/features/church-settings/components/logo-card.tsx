import { m } from '@church/i18n/messages';
import { ImageUp, Trash2, Zap } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ChurchLogoTile } from '@/components/church-logo-tile';
import { Button } from '@/components/ui/button';
import {
  logoErrorOf,
  useRemoveChurchLogo,
  useRestoreChurchLogo,
  useUploadChurchLogo,
} from '@/features/church-settings/church-settings-queries';
import { LogoCropDialog } from '@/features/church-settings/components/logo-crop-dialog';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

interface LogoCardProps {
  logoUrl: string | null;
  logoKey: string | null;
}

/** The vertical logo card: applies at once ("Salvo na hora"), outside the form's save. */
export function LogoCard({ logoUrl, logoKey }: LogoCardProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  /** The picked image, being framed before upload. */
  const [picked, setPicked] = React.useState<File | null>(null);
  const errorId = React.useId();
  const upload = useUploadChurchLogo();
  const remove = useRemoveChurchLogo();
  const restore = useRestoreChurchLogo();
  const busy = upload.isPending || remove.isPending || restore.isPending;

  const failed = (cause: unknown) =>
    setError(logoErrorOf({ error: cause }) ?? m.church_settings_logo_failed());

  const onFile = (file: File | undefined) => {
    if (!file) return;
    // The server decides by the bytes; these only spare a pointless upload.
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError(m.error_logo_unsupported_type());
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(m.error_logo_too_large());
      return;
    }
    setError(null);
    setPicked(file);
  };

  const onFramed = (file: File) => {
    setPicked(null);
    upload.mutate(
      { file },
      {
        onSuccess: () => toast.success(m.church_settings_logo_updated()),
        onError: failed,
      },
    );
  };

  const onRemove = () => {
    const previous = logoKey;
    setError(null);
    remove.mutate(undefined, {
      onSuccess: () =>
        toast(m.church_settings_logo_removed(), {
          action: previous
            ? {
                label: m.church_settings_logo_undo(),
                onClick: () =>
                  restore.mutate({ key: previous }, { onError: failed }),
              }
            : undefined,
        }),
      onError: failed,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-32 items-center justify-center">
        {logoUrl ? (
          <ChurchLogoTile
            name={m.church_settings_logo_alt()}
            logoUrl={logoUrl}
            size="card"
          />
        ) : (
          <span className="radius-control flex size-full items-center justify-center border border-dashed text-muted-foreground text-xs">
            {m.church_settings_logo_none()}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          type="button"
          disabled={busy}
          aria-describedby={error ? errorId : undefined}
          onClick={() => inputRef.current?.click()}
          className={logoUrl ? '' : 'col-span-2'}
        >
          <ImageUp aria-hidden />
          {logoUrl
            ? m.church_settings_logo_replace()
            : m.church_settings_logo_upload()}
        </Button>
        {logoUrl ? (
          <Button
            variant="ghost"
            type="button"
            disabled={busy}
            onClick={onRemove}
          >
            <Trash2 aria-hidden /> {m.church_settings_logo_remove()}
          </Button>
        ) : null}
      </div>
      <p className="flex items-start gap-1.5 text-sm">
        <Zap
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <span>
          {m.church_settings_logo_instant()}{' '}
          <span className="text-muted-foreground">
            {m.church_settings_logo_formats()}
          </span>
        </span>
      </p>
      {error ? (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <LogoCropDialog
        file={picked}
        onConfirm={onFramed}
        onCancel={() => setPicked(null)}
      />
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        aria-label={m.church_settings_logo_file()}
        className="hidden"
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </div>
  );
}

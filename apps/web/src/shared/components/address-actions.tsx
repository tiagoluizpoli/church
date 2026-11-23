import { m } from '@church/i18n/messages';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  type DirectionsAddress,
  detectDevice,
  directionsLink,
  formatAddress,
} from '@/shared/utils/directions';

interface AddressActionsProps {
  address: DirectionsAddress;
  className?: string;
}

/** *Como chegar* for the visitor's device and *Copiar endereço*. */
export function AddressActions({ address, className }: AddressActionsProps) {
  const formatted = formatAddress({ address });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      toast.success(m.church_settings_preview_address_copied());
    } catch {
      // A non-secure origin (http:// on a phone) or a denied permission: show it to copy by hand.
      toast.error(m.address_copy_failed({ address: formatted }));
    }
  };
  return (
    <div className={cn('flex flex-wrap gap-3', className)}>
      <a
        href={directionsLink({
          address,
          device: detectDevice({ userAgent: navigator.userAgent }),
        })}
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {m.church_settings_preview_directions()}
      </a>
      <button
        type="button"
        onClick={copy}
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        {m.church_settings_preview_copy_address()}
      </button>
    </div>
  );
}

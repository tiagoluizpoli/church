import { useFormControlSize } from '@/components/ui/form-control-size';

/** Compact controls on desktop; 44 px touch targets inside the screen's touch context. */
export function useControlSizes() {
  const touch = useFormControlSize() === 'touch';
  return {
    icon: touch ? 'icon-touch' : 'icon',
    small: touch ? 'touch' : 'sm',
    touch,
  } as const;
}

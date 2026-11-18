import { type ComponentProps, useEffect, useState } from 'react';

/** Delay before a pending skeleton appears, so fast loads never flash one. */
export const PENDING_DELAY_MS = 200;

type PendingProps = Omit<
  ComponentProps<'div'>,
  'aria-busy' | 'aria-label' | 'role'
> & {
  /** Accessible name of the busy region, announced while it loads. */
  label: string;
};

/** Busy live region for first-load skeletons: `role="status"`, `aria-busy`
 * and the `label` immediately, `children` (the skeleton) only after
 * {@link PENDING_DELAY_MS}. The one place the delay lives — pages must not add
 * their own. */
export function Pending({ label, children, ...props }: PendingProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), PENDING_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div {...props} role="status" aria-busy="true" aria-label={label}>
      {visible ? children : null}
    </div>
  );
}

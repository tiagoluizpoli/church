import { type ComponentProps, useEffect, useState } from 'react';

/** Delay before a pending skeleton appears, so fast loads never flash one. */
export const PENDING_DELAY_MS = 200;

/** Busy region for first-load skeletons: `aria-busy` immediately, `children`
 * (the skeleton) only after {@link PENDING_DELAY_MS}. The one place the delay
 * lives — pages must not add their own. */
export function Pending({
  children,
  ...props
}: Omit<ComponentProps<'div'>, 'aria-busy'>) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), PENDING_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div aria-busy="true" {...props}>
      {visible ? children : null}
    </div>
  );
}

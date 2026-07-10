import * as React from 'react';

export type FormControlSize = 'default' | 'touch';

const FormControlSizeContext = React.createContext<FormControlSize>('default');

/** Bumps descendant `Button`/`Input` controls to a 44px+ touch target,
 * per DESIGN.md's mobile-density rule, without every consumer opting in. */
export function FormControlSizeProvider({
  size,
  children,
}: {
  size: FormControlSize;
  children: React.ReactNode;
}) {
  return (
    <FormControlSizeContext.Provider value={size}>
      {children}
    </FormControlSizeContext.Provider>
  );
}

export function useFormControlSize() {
  return React.useContext(FormControlSizeContext);
}

export interface DayAnchor {
  /** The page's `useId` prefix, so two pages never share ids. */
  prefix: string;
  date: string;
}

/** The element id of a day section, so the answer summary can jump to it. */
export function dayAnchorId({ prefix, date }: DayAnchor): string {
  return `${prefix}-day-${date}`;
}

/** Scrolls to a day (opening its fold), then focuses its heading. */
export function jumpToDay(anchor: DayAnchor): void {
  const section = document.getElementById(dayAnchorId(anchor));
  if (!section) return;
  const folded = section.closest('details');
  if (folded) folded.open = true;
  const reduceMotion = window.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  ).matches;
  section.scrollIntoView?.({
    block: 'start',
    behavior: reduceMotion ? 'auto' : 'smooth',
  });
  section.querySelector('h2')?.focus({ preventScroll: true });
}

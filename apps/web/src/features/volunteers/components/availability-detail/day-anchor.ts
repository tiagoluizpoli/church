/** The element id of a day section, so the answer summary can jump to it. */
export function dayAnchorId(prefix: string, date: string): string {
  return `${prefix}-day-${date}`;
}

/** Scrolls to a day (opening its fold), then focuses its heading. */
export function jumpToDay(prefix: string, date: string): void {
  const section = document.getElementById(dayAnchorId(prefix, date));
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

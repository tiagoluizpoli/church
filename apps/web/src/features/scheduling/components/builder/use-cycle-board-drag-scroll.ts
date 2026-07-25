import { type PointerEvent, useRef } from 'react';

export interface DragScrollState {
  pointerId: number;
  startClientX: number;
  startScrollLeft: number;
  hasDragged: boolean;
  captureElement: HTMLDivElement;
}

const clearDrag = ({
  dragState,
  pointerId,
}: {
  dragState: React.RefObject<DragScrollState | null>;
  pointerId: number;
}): void => {
  const captureElement = dragState.current?.captureElement;
  dragState.current = null;
  captureElement?.classList.remove('select-none');
  if (captureElement?.hasPointerCapture?.(pointerId))
    captureElement.releasePointerCapture(pointerId);
};

const BOARD_DRAG_THRESHOLD_PX = 4;

/**
 * Pointer-drag-to-scroll for the board's horizontal `ScrollArea`. A drag armed
 * over the board's own background (not a button, input, or the scrollbar
 * itself) scrolls the viewport instead of doing nothing — the board is wider
 * than the viewport on any cycle with more than a couple of visible dates.
 *
 * `suppressClickRef` exists because a drag can end with the pointer sitting
 * over a cell button underneath it; the browser still fires a `click` there on
 * release, which would otherwise fire that button as if it had been pressed
 * on purpose. `onClickCapture` swallows exactly that one click.
 */
export function useBoardDragScroll() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragScrollState | null>(null);
  const suppressClickRef = useRef(false);

  const clearBoardDrag = (pointerId: number) =>
    clearDrag({ dragState, pointerId });

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest(
        'button, input, select, textarea, a, [role="button"], [data-slot="scroll-area-scrollbar"]',
      )
    )
      return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    dragState.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startScrollLeft: viewport.scrollLeft,
      hasDragged: false,
      captureElement: event.currentTarget,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const drag = dragState.current;
    if (!viewport || !drag || drag.pointerId !== event.pointerId) return;
    if (event.buttons === 0) {
      clearBoardDrag(event.pointerId);
      return;
    }
    const distance = event.clientX - drag.startClientX;
    if (Math.abs(distance) > BOARD_DRAG_THRESHOLD_PX) {
      if (!drag.hasDragged) {
        drag.hasDragged = true;
        event.currentTarget.classList.add('select-none');
      }
      event.preventDefault();
      viewport.scrollLeft = drag.startScrollLeft - distance;
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClickRef.current = drag.hasDragged;
    clearBoardDrag(event.pointerId);
  };

  const onLostPointerCapture = (event: PointerEvent<HTMLDivElement>) =>
    clearBoardDrag(event.pointerId);

  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return {
    viewportRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onLostPointerCapture,
    onClickCapture,
  };
}

const DATE_DRAG_THRESHOLD_PX = 10;
// The date strip's cards sit edge-to-edge with almost no gap between them
// (unlike the board's spacious cells), so drag has to be armable by
// pressing directly on a card, not just in the sliver between them. A
// slightly higher threshold than the board's absorbs ordinary click jitter
// without needing to exclude buttons from arming the drag at all.

/**
 * Pointer-drag-to-scroll for the pinned date strip. Deliberately not the same
 * hook as `useBoardDragScroll`: the strip has no click-suppression (its only
 * interactive element is the small per-card focus button, which is excluded
 * from arming the drag in the first place) and no `buttons === 0` early-exit,
 * so unifying the two would either add dead code to the strip or silently
 * change the board's behaviour.
 */
export function useDateStripDragScroll() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragScrollState | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport || event.button !== 0) return;
    // Only the small per-card focus button is an interactive element here
    // now — everything else on a card is plain drag surface with no click
    // handler of its own, so excluding buttons from arming the drag no
    // longer costs almost all the grabbable area the way it did when the
    // whole card was one giant button.
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest('button, [role="button"]')
    )
      return;
    dragState.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startScrollLeft: viewport.scrollLeft,
      hasDragged: false,
      captureElement: event.currentTarget,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const drag = dragState.current;
    if (!viewport || !drag || drag.pointerId !== event.pointerId) return;
    const distance = event.clientX - drag.startClientX;
    if (Math.abs(distance) > DATE_DRAG_THRESHOLD_PX) {
      drag.hasDragged = true;
      event.preventDefault();
      viewport.scrollLeft = drag.startScrollLeft - distance;
    }
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragState.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return {
    viewportRef,
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  };
}

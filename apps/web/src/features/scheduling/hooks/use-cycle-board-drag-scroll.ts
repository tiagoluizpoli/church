import { type MouseEvent, type PointerEvent, useRef } from 'react';

interface DragScrollState {
  pointerId: number;
  startClientX: number;
  startScrollLeft: number;
  hasDragged: boolean;
  captureElement: HTMLDivElement;
}

interface UseDragScrollOptions {
  /** Pointer travel before a press becomes a drag; below it the click survives. */
  thresholdPx: number;
  /** Targets that keep their own press (buttons, draggable chips): never arm a scroll. */
  ignoreSelector: string;
}

/**
 * Pointer-drag-to-scroll for a horizontal `ScrollArea`. Shared by the board and
 * the date strip so both pan identically. A press on an `ignoreSelector`
 * target never arms (dnd-kit draggables carry `role="button"`, so a card being
 * dragged is never also a pan). Touch keeps its native swipe — the surfaces
 * set `touch-pan-y`, so the browser owns horizontal touch and no pointer
 * capture is needed there.
 *
 * `onClickCapture` swallows the one click a finished drag would otherwise fire
 * on whatever sits under the pointer on release.
 */
function useDragScroll({ thresholdPx, ignoreSelector }: UseDragScrollOptions) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragScrollState | null>(null);
  const suppressClickRef = useRef(false);

  const clearDrag = (pointerId: number) => {
    const captureElement = dragState.current?.captureElement;
    dragState.current = null;
    captureElement?.classList.remove('select-none');
    if (captureElement?.hasPointerCapture?.(pointerId))
      captureElement.releasePointerCapture(pointerId);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest(ignoreSelector)) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    suppressClickRef.current = false;
    dragState.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startScrollLeft: viewport.scrollLeft,
      hasDragged: false,
      captureElement: event.currentTarget,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const drag = dragState.current;
    if (!viewport || !drag || drag.pointerId !== event.pointerId) return;
    if (event.buttons === 0) {
      clearDrag(event.pointerId);
      return;
    }
    const distance = event.clientX - drag.startClientX;
    if (Math.abs(distance) > thresholdPx) {
      if (!drag.hasDragged) {
        drag.hasDragged = true;
        event.currentTarget.classList.add('select-none');
        // Captured only once a drag starts: capturing on press would retarget
        // a plain click from the pressed button to this surface.
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
      event.preventDefault();
      viewport.scrollLeft = drag.startScrollLeft - distance;
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClickRef.current = drag.hasDragged;
    clearDrag(event.pointerId);
  };

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
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
    onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) =>
      clearDrag(event.pointerId),
    onClickCapture,
  };
}

export const useBoardDragScroll = () =>
  useDragScroll({
    thresholdPx: 4,
    ignoreSelector:
      'button, input, select, textarea, a, [role="button"], [data-slot="scroll-area-scrollbar"]',
  });

// Every date chip is a whole button, so a drag must arm on the chips
// themselves; the higher threshold keeps a plain click a toggle.
export const useDateStripDragScroll = () =>
  useDragScroll({
    thresholdPx: 10,
    ignoreSelector: '[data-slot="scroll-area-scrollbar"]',
  });

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  useBoardDragScroll,
  useDateStripDragScroll,
} from '@/features/scheduling/hooks/use-cycle-board-drag-scroll';

function Surface({ hook }: { hook: typeof useBoardDragScroll }) {
  const drag = hook();
  return (
    <section
      data-testid="surface"
      onPointerDown={drag.onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onClickCapture={drag.onClickCapture}
    >
      <div data-testid="viewport" ref={drag.viewportRef} />
      <p data-testid="plain">plain</p>
      <button type="button" data-testid="button" onClick={vi.fn()}>
        go
      </button>
      {/* biome-ignore lint/a11y/useSemanticElements: mirrors the role dnd-kit puts on every draggable */}
      <div role="button" tabIndex={0} data-testid="draggable">
        chip
      </div>
    </section>
  );
}

const pan = (target: Element, from: number, to: number) => {
  fireEvent.pointerDown(target, { pointerId: 1, clientX: from, buttons: 1 });
  fireEvent.pointerMove(target, { pointerId: 1, clientX: to, buttons: 1 });
};

describe.each([
  ['board', useBoardDragScroll, 4],
  ['date strip', useDateStripDragScroll, 10],
])('%s drag-to-scroll', (_name, hook, threshold) => {
  it('scrolls the viewport once the pointer passes the threshold', () => {
    render(<Surface hook={hook} />);
    pan(screen.getByTestId('plain'), 200, 200 - threshold - 1);
    expect(screen.getByTestId('viewport').scrollLeft).toBe(threshold + 1);
  });

  it('ignores movement within the threshold', () => {
    render(<Surface hook={hook} />);
    pan(screen.getByTestId('plain'), 200, 200 - threshold);
    expect(screen.getByTestId('viewport').scrollLeft).toBe(0);
  });

  it('swallows only the click that ends a real drag', () => {
    const onClick = vi.fn();
    render(<Surface hook={hook} />);
    const surface = screen.getByTestId('surface');
    surface.addEventListener('click', onClick);
    const plain = screen.getByTestId('plain');
    pan(plain, 200, 100);
    fireEvent.pointerUp(plain, { pointerId: 1 });
    fireEvent.click(plain);
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(plain);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps the click after a tiny movement', () => {
    const onClick = vi.fn();
    render(<Surface hook={hook} />);
    screen.getByTestId('surface').addEventListener('click', onClick);
    const plain = screen.getByTestId('plain');
    pan(plain, 200, 199);
    fireEvent.pointerUp(plain, { pointerId: 1 });
    fireEvent.click(plain);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('board drag-to-scroll targets', () => {
  it.each(['button', 'draggable'])('does not arm on the %s', (id) => {
    render(<Surface hook={useBoardDragScroll} />);
    pan(screen.getByTestId(id), 200, 100);
    expect(screen.getByTestId('viewport').scrollLeft).toBe(0);
  });
});

// Every date chip is a whole button, so the strip pans from a button too.
describe('date strip drag-to-scroll on a chip', () => {
  it('scrolls when the drag starts on a button', () => {
    render(<Surface hook={useDateStripDragScroll} />);
    pan(screen.getByTestId('button'), 200, 100);
    expect(screen.getByTestId('viewport').scrollLeft).toBe(100);
  });

  it('keeps a plain click on the button and swallows the click after a drag', () => {
    const onClick = vi.fn();
    render(<Surface hook={useDateStripDragScroll} />);
    const button = screen.getByTestId('button');
    button.addEventListener('click', onClick);
    fireEvent.pointerDown(button, { pointerId: 1, clientX: 200, buttons: 1 });
    fireEvent.pointerUp(button, { pointerId: 1 });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    pan(button, 200, 100);
    fireEvent.pointerUp(button, { pointerId: 1 });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('captures the pointer only once a drag starts', () => {
    render(<Surface hook={useDateStripDragScroll} />);
    const surface = screen.getByTestId('surface');
    const capture = vi.fn();
    surface.setPointerCapture = capture;
    const button = screen.getByTestId('button');
    fireEvent.pointerDown(button, { pointerId: 1, clientX: 200, buttons: 1 });
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 195, buttons: 1 });
    expect(capture).not.toHaveBeenCalled();
    fireEvent.pointerMove(button, { pointerId: 1, clientX: 150, buttons: 1 });
    expect(capture).toHaveBeenCalledWith(1);
  });
});

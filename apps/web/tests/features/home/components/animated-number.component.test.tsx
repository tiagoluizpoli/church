import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimatedNumber } from '@/features/home/components/animated-number';

interface FakeAnimation {
  progress: number;
  finish: () => void;
}

let animations: FakeAnimation[] = [];
let reducedMotion = false;

beforeEach(() => {
  animations = [];
  reducedMotion = false;
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches: query === '(prefers-reduced-motion: reduce)' && reducedMotion,
      }) as MediaQueryList,
  );
  HTMLElement.prototype.animate = vi.fn(() => {
    let finish = () => {};
    const fake: FakeAnimation = { progress: 0.5, finish: () => finish() };
    animations.push(fake);
    const finished = new Promise<void>((resolve) => {
      finish = () => {
        fake.progress = 1;
        resolve();
      };
    });
    return {
      effect: { getComputedTiming: () => ({ progress: fake.progress }) },
      playState: 'running',
      finished,
      cancel: vi.fn(),
    } as unknown as Animation;
  });
});

afterEach(() => vi.restoreAllMocks());

const percent = (value: number) => `${value}%`;
const overlay = (container: HTMLElement) =>
  container.querySelector('[aria-hidden="true"]') as HTMLElement;

describe('AnimatedNumber', () => {
  it('paints the final value first, without animating', () => {
    const { container } = render(
      <AnimatedNumber value={40} format={percent} />,
    );

    expect(screen.getByText('40%')).toBeVisible();
    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();
    expect(overlay(container)).toBeEmptyDOMElement();
  });

  it('counts from the old to the new value in a hidden twin while the real text already reads the new one', async () => {
    const { container, rerender } = render(
      <AnimatedNumber value={40} format={percent} />,
    );
    rerender(<AnimatedNumber value={80} format={percent} />);

    expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(1);
    expect(overlay(container)).toHaveTextContent('60%');
    expect(overlay(container)).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('80%')).toBeInTheDocument();

    await act(async () => animations[0].finish());

    expect(overlay(container)).toBeEmptyDOMElement();
    expect(screen.getByText('80%')).toBeVisible();
  });

  it('does not animate a re-render with the same value', () => {
    const { rerender } = render(<AnimatedNumber value={40} format={percent} />);
    rerender(<AnimatedNumber value={40} format={percent} />);

    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();
  });

  it('jumps straight to the new value under reduced motion', () => {
    reducedMotion = true;
    const { container, rerender } = render(
      <AnimatedNumber value={40} format={percent} />,
    );
    rerender(<AnimatedNumber value={80} format={percent} />);

    expect(HTMLElement.prototype.animate).not.toHaveBeenCalled();
    expect(overlay(container)).toBeEmptyDOMElement();
    expect(screen.getByText('80%')).toBeVisible();
  });
});

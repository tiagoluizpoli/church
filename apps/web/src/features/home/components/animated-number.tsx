import { useAnimatedNumber } from '@/features/home/hooks/use-animated-number';
import { cn } from '@/lib/utils';

interface AnimatedNumberProps {
  value: number;
  format?: (value: number) => string;
  className?: string;
}

/** A number that counts to its new value when it changes; the real text is always the final one. */
export function AnimatedNumber({
  value,
  format = String,
  className,
}: AnimatedNumberProps) {
  const { textRef, motionRef } = useAnimatedNumber({ value, format });
  return (
    <span className={cn('relative inline-block tabular-nums', className)}>
      <span ref={textRef}>{format(value)}</span>
      <span
        ref={motionRef}
        aria-hidden
        hidden
        className="absolute inset-y-0 left-0 whitespace-nowrap"
      />
    </span>
  );
}

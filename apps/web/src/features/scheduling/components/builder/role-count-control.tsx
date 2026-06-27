import { Button } from '@church/ui/components/button';
import { Minus, Plus } from 'lucide-react';

interface RoleCountControlProps {
  count: number;
  disabled?: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
}

export function RoleCountControl({
  count,
  disabled,
  onIncrement,
  onDecrement,
}: RoleCountControlProps) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      data-testid="role-count-control"
    >
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-4"
        disabled={disabled || count <= 1}
        onClick={onDecrement}
        aria-label="Decrease count"
      >
        <Minus className="size-3" />
      </Button>
      <span className="w-4 text-center tabular-nums">{count}</span>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-4"
        disabled={disabled}
        onClick={onIncrement}
        aria-label="Increase count"
      >
        <Plus className="size-3" />
      </Button>
    </span>
  );
}

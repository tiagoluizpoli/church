interface HeaderStatChipProps {
  testId: string;
  label: string;
  value: string | number;
  testIdOnValue?: boolean;
}
export function HeaderStatChip({
  testId,
  label,
  value,
  testIdOnValue = false,
}: HeaderStatChipProps) {
  return (
    <div
      className="radius-surface flex items-center gap-2 border border-border/70 bg-background/70 px-3 py-1.5 text-sm"
      data-testid={testIdOnValue ? undefined : testId}
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className="font-medium text-xs"
        data-testid={testIdOnValue ? testId : undefined}
      >
        {value}
      </span>
    </div>
  );
}

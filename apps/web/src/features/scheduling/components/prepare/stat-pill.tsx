export interface StatPillProps {
  label: string;
  value: number | string;
  testId: string;
}

export function StatPill({ label, value, testId }: StatPillProps) {
  return (
    <div className="radius-surface border border-border/70 bg-background/70 px-3 py-1.5 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>{' '}
      <span className="font-medium" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

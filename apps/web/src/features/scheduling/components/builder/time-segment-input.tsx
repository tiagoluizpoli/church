import { Clock3 } from 'lucide-react';
import { useRef } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface TimeSegmentInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

interface TimeParts {
  hour: string;
  minute: string;
}

function splitTimeValue(value: string): TimeParts {
  const [hour = '', minute = ''] = value.split(':');
  return { hour, minute };
}

function joinTimeValue({ hour, minute }: TimeParts): string {
  if (!hour && !minute) return '';
  return `${hour}:${minute}`;
}

function clampSegment(raw: string, max: number): string {
  if (!raw) return '';
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return '';
  return String(Math.min(Math.max(parsed, 0), max)).padStart(2, '0');
}

export function isValidTimeValue(value: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function TimeSegmentInput({
  label,
  value,
  onChange,
}: TimeSegmentInputProps) {
  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);
  const parts = splitTimeValue(value);

  const updateParts = (nextParts: TimeParts) => {
    onChange(joinTimeValue(nextParts));
  };

  const readCurrentParts = (): TimeParts => ({
    hour: hourRef.current?.value ?? parts.hour,
    minute: minuteRef.current?.value ?? parts.minute,
  });

  const handleSegmentChange = (segment: keyof TimeParts, nextValue: string) => {
    const digits = nextValue.replace(/\D/g, '').slice(0, 2);
    const nextParts =
      segment === 'hour'
        ? { ...parts, hour: digits }
        : { ...parts, minute: digits };

    updateParts(nextParts);

    if (segment === 'hour' && digits.length === 2) {
      minuteRef.current?.focus();
      minuteRef.current?.select();
    }
  };

  const handleSegmentBlur = (segment: keyof TimeParts, rawValue: string) => {
    const currentParts = readCurrentParts();
    const normalized =
      segment === 'hour'
        ? clampSegment(rawValue, 23)
        : clampSegment(rawValue, 59);

    if (segment === 'hour') {
      updateParts({ ...currentParts, hour: normalized });
      return;
    }

    updateParts({ ...currentParts, minute: normalized });
  };

  return (
    <fieldset className="space-y-1">
      <legend className="font-medium text-sm">{label}</legend>
      <div className="radius-control flex items-center gap-2 border border-input bg-background px-3 py-2">
        <Clock3 className="size-4 text-muted-foreground" />
        <div className="flex items-center gap-2">
          <Input
            ref={hourRef}
            aria-label={`${label} hour`}
            inputMode="numeric"
            maxLength={2}
            placeholder="00"
            value={parts.hour}
            onChange={(event) =>
              handleSegmentChange('hour', event.target.value)
            }
            onFocus={(event) => event.target.select()}
            onClick={(event) => event.currentTarget.select()}
            onBlur={(event) =>
              handleSegmentBlur('hour', event.currentTarget.value)
            }
            className={cn(
              'h-10 w-12 border-border bg-card px-0 text-center font-medium tabular-nums',
            )}
          />
          <span className="font-medium text-muted-foreground">:</span>
          <Input
            ref={minuteRef}
            aria-label={`${label} minute`}
            inputMode="numeric"
            maxLength={2}
            placeholder="00"
            value={parts.minute}
            onChange={(event) =>
              handleSegmentChange('minute', event.target.value)
            }
            onFocus={(event) => event.target.select()}
            onClick={(event) => event.currentTarget.select()}
            onBlur={(event) =>
              handleSegmentBlur('minute', event.currentTarget.value)
            }
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && !parts.minute) {
                hourRef.current?.focus();
                hourRef.current?.select();
              }
            }}
            className={cn(
              'h-10 w-12 border-border bg-card px-0 text-center font-medium tabular-nums',
            )}
          />
        </div>
      </div>
    </fieldset>
  );
}

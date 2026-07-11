'use client';

import { enUS } from 'date-fns/locale';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react';
import type * as React from 'react';
import {
  type DayButtonProps,
  DayPicker,
  getDefaultClassNames,
} from 'react-day-picker';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  buttonVariant = 'ghost',
  formatters,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>['variant'];
}) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      locale={enUS}
      className={cn('bg-background p-3', className)}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString('en-US', { month: 'short' }),
        ...formatters,
      }}
      classNames={{
        root: cn('w-fit', defaultClassNames.root),
        months: cn('relative flex flex-col gap-4', defaultClassNames.months),
        month: cn('flex w-full flex-col gap-4', defaultClassNames.month),
        nav: cn(
          'absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1',
          defaultClassNames.nav,
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant, size: 'icon-sm' }),
          'select-none aria-disabled:opacity-50',
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant, size: 'icon-sm' }),
          'select-none aria-disabled:opacity-50',
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          'flex h-7 w-full items-center justify-center text-sm',
          defaultClassNames.month_caption,
        ),
        dropdowns: cn(
          'flex h-7 w-full items-center justify-center gap-1.5 text-sm',
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn(
          'radius-control relative border border-input has-focus:border-ring has-focus:ring-1 has-focus:ring-ring/50',
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn(
          'absolute inset-0 bg-popover opacity-0',
          defaultClassNames.dropdown,
        ),
        caption_label: cn(
          'select-none font-medium text-sm',
          captionLayout === 'label'
            ? 'text-sm'
            : 'flex h-7 items-center gap-1 rounded-md pr-1 pl-2 text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground',
          defaultClassNames.caption_label,
        ),
        month_grid: cn('w-full border-collapse', defaultClassNames.month_grid),
        weekdays: cn('flex', defaultClassNames.weekdays),
        weekday: cn(
          'flex-1 select-none rounded-md text-[0.8rem] text-muted-foreground',
          defaultClassNames.weekday,
        ),
        week: cn('mt-2 flex w-full', defaultClassNames.week),
        day: cn(
          'group/day relative aspect-square h-8 w-8 select-none p-0 text-center',
          defaultClassNames.day,
        ),
        today: cn(
          'radius-control bg-accent text-accent-foreground',
          defaultClassNames.today,
        ),
        outside: cn(
          'text-muted-foreground aria-selected:text-muted-foreground',
          defaultClassNames.outside,
        ),
        disabled: cn(
          'text-muted-foreground opacity-50',
          defaultClassNames.disabled,
        ),
        hidden: cn('invisible', defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ className: chevronClassName, orientation }) => {
          if (orientation === 'left') {
            return (
              <ChevronLeftIcon className={cn('size-4', chevronClassName)} />
            );
          }
          if (orientation === 'right') {
            return (
              <ChevronRightIcon className={cn('size-4', chevronClassName)} />
            );
          }
          return <ChevronDownIcon className={cn('size-4', chevronClassName)} />;
        },
        DayButton: CalendarDayButton,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: DayButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      data-selected-single={
        modifiers.selected && !modifiers.range_start && !modifiers.range_end
      }
      className={cn(
        'radius-control aspect-square h-8 w-8 font-normal leading-none data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground',
        className,
      )}
      {...props}
    >
      {day.date.getDate()}
    </Button>
  );
}

export { Calendar };

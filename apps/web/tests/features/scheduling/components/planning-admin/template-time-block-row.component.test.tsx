import { parseTimeOfDay } from '@church/time';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { TemplateTimeBlockDraft } from '@/features/scheduling/components/planning-admin/planning-admin.types';
import {
  TemplateTimeBlockRow,
  type TemplateTimeBlockRowProps,
} from '@/features/scheduling/components/planning-admin/template-time-block-row';
import { renderWithProviders } from '@/tests/setup/render';
import { fillTimeOfDayField } from '@/tests/setup/time-of-day';

const initialBlock: TemplateTimeBlockDraft = {
  key: 'block-1',
  label: 'Welcome',
  startTime: parseTimeOfDay({ value: '09:00' }),
  endTime: parseTimeOfDay({ value: '09:30' }),
};

interface HarnessProps {
  onBlockChange: TemplateTimeBlockRowProps['onBlockChange'];
}

/** A real consumer feeds `onBlockChange` back into `block` — the segmented
 * `TimeOfDayField` commits provisionally per keystroke, so a static prop
 * fights later keystrokes with a stale controlled value. */
function Harness({ onBlockChange }: HarnessProps) {
  const [block, setBlock] = useState(initialBlock);
  return (
    <TemplateTimeBlockRow
      block={block}
      index={0}
      totalBlocks={1}
      onBlockChange={(input) => {
        setBlock((current) =>
          input.field === 'label'
            ? { ...current, label: input.value }
            : { ...current, [input.field]: input.value },
        );
        onBlockChange(input);
      }}
      onRemoveBlock={vi.fn()}
    />
  );
}

describe('TemplateTimeBlockRow', () => {
  it('drives the start time field and reports a branded TimeOfDay', async () => {
    const onBlockChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Harness onBlockChange={onBlockChange} />);

    await fillTimeOfDayField({
      user,
      field: screen.getByTestId('template-time-block-start-time-input'),
      time: '10:15',
    });

    expect(onBlockChange).toHaveBeenLastCalledWith({
      blockId: 'block-1',
      field: 'startTime',
      value: '10:15',
    });
  });

  it('drives the end time field independently of the start field', async () => {
    const onBlockChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Harness onBlockChange={onBlockChange} />);

    await fillTimeOfDayField({
      user,
      field: screen.getByTestId('template-time-block-end-time-input'),
      time: '11:45',
    });

    expect(onBlockChange).toHaveBeenLastCalledWith({
      blockId: 'block-1',
      field: 'endTime',
      value: '11:45',
    });
  });

  it('renders no native time input', () => {
    renderWithProviders(
      <TemplateTimeBlockRow
        block={initialBlock}
        index={0}
        totalBlocks={1}
        onBlockChange={vi.fn()}
        onRemoveBlock={vi.fn()}
      />,
    );

    expect(
      document.querySelector('input[type="time"]'),
    ).not.toBeInTheDocument();
  });

  it('shows the computed span with an ends-next-day suffix for an overnight block', () => {
    renderWithProviders(
      <TemplateTimeBlockRow
        block={{
          ...initialBlock,
          startTime: parseTimeOfDay({ value: '22:00' }),
          endTime: parseTimeOfDay({ value: '02:00' }),
        }}
        index={0}
        totalBlocks={1}
        onBlockChange={vi.fn()}
        onRemoveBlock={vi.fn()}
      />,
    );

    expect(screen.getByTestId('template-time-block-span')).toHaveTextContent(
      'Dura 4 h · termina no dia seguinte',
    );
  });

  it('shows the computed span without a suffix for a same-day block', () => {
    renderWithProviders(
      <TemplateTimeBlockRow
        block={initialBlock}
        index={0}
        totalBlocks={1}
        onBlockChange={vi.fn()}
        onRemoveBlock={vi.fn()}
      />,
    );

    expect(screen.getByTestId('template-time-block-span')).toHaveTextContent(
      'Dura 30 min',
    );
  });
});

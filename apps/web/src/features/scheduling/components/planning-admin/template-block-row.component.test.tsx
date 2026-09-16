import { parseTimeOfDay } from '@church/time';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { TemplateBlockDraft } from './planning-admin.types';
import {
  TemplateBlockRow,
  type TemplateBlockRowProps,
} from './template-block-row';
import { renderWithProviders } from '@/__tests__/setup/render';
import { fillTimeOfDayField } from '@/__tests__/setup/time-of-day';

const initialBlock: TemplateBlockDraft = {
  id: 'block-1',
  label: 'Welcome',
  startTime: parseTimeOfDay({ value: '09:00' }),
  endTime: parseTimeOfDay({ value: '09:30' }),
};

interface HarnessProps {
  onBlockChange: TemplateBlockRowProps['onBlockChange'];
}

/** A real consumer feeds `onBlockChange` back into `block` — the segmented
 * `TimeOfDayField` commits provisionally per keystroke, so a static prop
 * fights later keystrokes with a stale controlled value. */
function Harness({ onBlockChange }: HarnessProps) {
  const [block, setBlock] = useState(initialBlock);
  return (
    <TemplateBlockRow
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

describe('TemplateBlockRow', () => {
  it('drives the start time field and reports a branded TimeOfDay', async () => {
    const onBlockChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<Harness onBlockChange={onBlockChange} />);

    await fillTimeOfDayField({
      user,
      field: screen.getByTestId('template-block-start-time-input'),
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
      field: screen.getByTestId('template-block-end-time-input'),
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
      <TemplateBlockRow
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
});

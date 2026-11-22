import { m } from '@church/i18n/messages';
import { parseTimeOfDay } from '@church/time';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  isPublic: false,
  place: '',
  placeAddressId: null,
};

const capabilities = vi.hoisted(() => ({ isChurchAdmin: false }));
const getChurchSettings = vi.hoisted(() => vi.fn());
vi.mock('@/utils/api-instances', () => ({
  churchSettingsApi: {
    getChurchSettings: (...args: unknown[]) => getChurchSettings(...args),
  },
}));
vi.mock('@/shared/hooks/use-caller-capabilities', () => ({
  useCallerCapabilities: () => capabilities,
}));

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

describe('TemplateTimeBlockRow Publico and place', () => {
  beforeEach(() => {
    getChurchSettings.mockResolvedValue({ addresses: [] });
  });

  function renderRow(onBlockChange = vi.fn()) {
    renderWithProviders(
      <TemplateTimeBlockRow
        block={initialBlock}
        index={0}
        totalBlocks={1}
        onBlockChange={onBlockChange}
        onRemoveBlock={vi.fn()}
      />,
    );
    return onBlockChange;
  }

  it('hides the controls from a non-admin', () => {
    capabilities.isChurchAdmin = false;
    renderRow();

    expect(
      screen.queryByTestId('template-time-block-public-switch'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('template-time-block-place-input'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('template-time-block-label-input')).toBeVisible();
  });

  it("offers no place, the Church's addresses and free text, and reports the address picked", async () => {
    capabilities.isChurchAdmin = true;
    getChurchSettings.mockResolvedValue({
      addresses: [
        {
          id: 'address-templo',
          label: 'Templo',
          street: 'Rua A',
          number: '10',
          complement: null,
          bairro: 'Centro',
          city: 'Campinas',
          uf: 'SP',
        },
      ],
    });
    const user = userEvent.setup();
    const onBlockChange = renderRow();

    const picker = await screen.findByTestId(
      'template-time-block-place-select',
    );
    expect(
      screen.queryByTestId('template-time-block-place-input'),
    ).not.toBeInTheDocument();
    await user.click(picker);
    expect(
      (await screen.findAllByRole('option')).map(
        (option) => option.textContent,
      ),
    ).toEqual([
      m.time_block_place_none(),
      'Templo',
      m.time_block_place_free_text(),
    ]);
    await user.click(screen.getByRole('option', { name: 'Templo' }));

    expect(onBlockChange).toHaveBeenCalledWith({
      blockKey: 'block-1',
      field: 'place',
      value: '',
    });
    expect(onBlockChange).toHaveBeenLastCalledWith({
      blockKey: 'block-1',
      field: 'placeAddressId',
      value: 'address-templo',
    });
  });

  it('shows the free-text field once free text is picked', async () => {
    capabilities.isChurchAdmin = true;
    getChurchSettings.mockResolvedValue({
      addresses: [
        {
          id: 'address-templo',
          label: 'Templo',
          street: 'Rua A',
          number: '10',
          complement: null,
          bairro: 'Centro',
          city: 'Campinas',
          uf: 'SP',
        },
      ],
    });
    const user = userEvent.setup();
    renderRow();

    await user.click(
      await screen.findByTestId('template-time-block-place-select'),
    );
    await user.click(
      await screen.findByRole('option', {
        name: m.time_block_place_free_text(),
      }),
    );

    expect(screen.getByTestId('template-time-block-place-input')).toBeVisible();
  });

  it('lets a ChurchAdmin toggle Publico and type a place', async () => {
    capabilities.isChurchAdmin = true;
    const user = userEvent.setup();
    const onBlockChange = renderRow();

    await user.click(screen.getByTestId('template-time-block-public-switch'));
    await user.type(screen.getByTestId('template-time-block-place-input'), 'A');

    expect(onBlockChange).toHaveBeenCalledWith({
      blockKey: 'block-1',
      field: 'isPublic',
      value: true,
    });
    expect(onBlockChange).toHaveBeenCalledWith({
      blockKey: 'block-1',
      field: 'place',
      value: 'A',
    });
    expect(onBlockChange).toHaveBeenLastCalledWith({
      blockKey: 'block-1',
      field: 'placeAddressId',
      value: null,
    });
  });
});

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
      blockKey: 'block-1',
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
      blockKey: 'block-1',
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

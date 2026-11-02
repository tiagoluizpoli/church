import { m } from '@church/i18n/messages';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  HeadcountGrid,
  type HeadcountGridMinimums,
  type HeadcountGridValues,
  headcountGridKey,
  normalizeHeadcountGrid,
} from '@/features/scheduling/components/headcount-grid/headcount-grid';
import { renderWithProviders } from '@/tests/setup/render';

const SECTORS = [
  { id: 'stage', name: 'Stage' },
  { id: 'door', name: 'Door' },
];
const ROLES = [{ id: 'singer', name: 'Singer' }];
const SHIFTS = [
  { key: 'first', label: 'Morning' },
  { key: 'second', label: 'Evening' },
];

interface HarnessProps {
  initial?: HeadcountGridValues;
  minimums?: HeadcountGridMinimums;
  disabled?: boolean;
}

let latest: HeadcountGridValues = {};

/** A caller that owns the drafts, as Usual setup and Prepare do. */
function Harness({ initial = {}, minimums, disabled }: HarnessProps) {
  const [values, setValues] = useState(initial);
  latest = values;
  return (
    <HeadcountGrid
      sectors={SECTORS}
      roles={ROLES}
      shifts={SHIFTS}
      values={values}
      minimums={minimums}
      disabled={disabled}
      onChange={({ shiftKey, sectorId, roleId, value }) =>
        setValues((current) => ({
          ...current,
          [headcountGridKey({ shiftKey, sectorId, roleId })]: value,
        }))
      }
    />
  );
}

function cell(sector: string, shift: string) {
  return screen.getByRole('spinbutton', {
    name: m.headcount_grid_cell_label({ role: 'Singer', sector, shift }),
  });
}

function normalized() {
  return normalizeHeadcountGrid({
    sectors: SECTORS,
    roles: ROLES,
    shifts: SHIFTS,
    values: latest,
  });
}

describe('HeadcountGrid', () => {
  it('keeps the same Role distinct per Sector and per Shift', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.type(cell('Stage', 'Morning'), '2');
    await user.type(cell('Door', 'Morning'), '1');
    await user.type(cell('Stage', 'Evening'), '5');

    expect(normalized()).toEqual({
      entries: [
        {
          shiftKey: 'first',
          sectorId: 'stage',
          roleId: 'singer',
          peopleNeeded: 2,
        },
        {
          shiftKey: 'first',
          sectorId: 'door',
          roleId: 'singer',
          peopleNeeded: 1,
        },
        {
          shiftKey: 'second',
          sectorId: 'stage',
          roleId: 'singer',
          peopleNeeded: 5,
        },
      ],
      invalidKeys: [],
    });
  });

  it('shows omitted pairs as blank zero and treats blank and 0 as omitted', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Harness
        initial={{
          [headcountGridKey({
            shiftKey: 'first',
            sectorId: 'stage',
            roleId: 'singer',
          })]: '3',
        }}
      />,
    );

    expect(cell('Door', 'Morning')).toHaveValue(null);
    expect(cell('Door', 'Morning')).toHaveAttribute('placeholder', '0');
    await user.clear(cell('Stage', 'Morning'));
    await user.type(cell('Door', 'Evening'), '0');

    expect(normalized()).toEqual({ entries: [], invalidKeys: [] });
    expect(screen.getAllByText(m.headcount_grid_empty_shift())).toHaveLength(2);
  });

  it('keeps an invalid entry visible and reports it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);

    await user.type(cell('Stage', 'Morning'), '1.5');

    expect(cell('Stage', 'Morning')).toHaveValue(1.5);
    expect(cell('Stage', 'Morning')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(m.headcount_grid_invalid())).toBeVisible();
    expect(normalized().invalidKeys).toEqual([
      headcountGridKey({
        shiftKey: 'first',
        sectorId: 'stage',
        roleId: 'singer',
      }),
    ]);
  });

  it('refuses a count below a caller-supplied minimum', async () => {
    const user = userEvent.setup();
    const key = headcountGridKey({
      shiftKey: 'first',
      sectorId: 'stage',
      roleId: 'singer',
    });
    renderWithProviders(<Harness minimums={{ [key]: 2 }} />);

    await user.type(cell('Stage', 'Morning'), '1');

    expect(
      screen.getByText(m.headcount_grid_below_minimum({ minimum: 2 })),
    ).toBeVisible();
    expect(
      normalizeHeadcountGrid({
        sectors: SECTORS,
        roles: ROLES,
        shifts: SHIFTS,
        values: latest,
        minimums: { [key]: 2 },
      }).invalidKeys,
    ).toEqual([key]);
  });

  it('disables every cell when the caller says so', () => {
    renderWithProviders(<Harness disabled />);

    for (const input of screen.getAllByRole('spinbutton')) {
      expect(input).toBeDisabled();
    }
  });
});

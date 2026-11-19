import { m } from '@church/i18n/messages';
import { Fragment } from 'react';
import { Input } from '@/components/ui/input';

/** A Sector or Role choice: the caller passes active registries only. */
export interface HeadcountGridCatalogItem {
  id: string;
  name: string;
}

/** One Shift of the grid: a stable editor key and the label people see. */
export interface HeadcountGridShift {
  key: string;
  label: string;
}

export interface HeadcountGridCell {
  shiftKey: string;
  sectorId: string;
  roleId: string;
}

/** What `onChange` receives: the cell and its raw draft text. */
export interface HeadcountGridChange extends HeadcountGridCell {
  value: string;
}

/** Draft strings keyed by `headcountGridKey`; a missing key is a blank cell. */
export type HeadcountGridValues = Record<string, string>;

/** Assigned-count floors keyed like the values (Prepare supplies them). */
export type HeadcountGridMinimums = Record<string, number>;

export interface HeadcountGridEntry extends HeadcountGridCell {
  peopleNeeded: number;
}

export interface HeadcountGridProps {
  sectors: HeadcountGridCatalogItem[];
  roles: HeadcountGridCatalogItem[];
  shifts: HeadcountGridShift[];
  values: HeadcountGridValues;
  onChange: (change: HeadcountGridChange) => void;
  minimums?: HeadcountGridMinimums;
  disabled?: boolean;
}

export function headcountGridKey({
  shiftKey,
  sectorId,
  roleId,
}: HeadcountGridCell): string {
  return `${shiftKey}|${sectorId}|${roleId}`;
}

type CellProblem = 'invalid' | 'belowMinimum';

type ParsedDraft =
  | { kind: 'omitted' }
  | { kind: 'count'; peopleNeeded: number }
  | { kind: 'invalid' };

interface ParseDraftInput {
  value: string | undefined;
}

/** The one zero rule every caller shares: blank and 0 omit the pair. */
function parseDraft({ value }: ParseDraftInput): ParsedDraft {
  const trimmed = (value ?? '').trim();
  if (trimmed === '') return { kind: 'omitted' };
  if (!/^\d+$/.test(trimmed)) return { kind: 'invalid' };
  const peopleNeeded = Number.parseInt(trimmed, 10);
  return peopleNeeded === 0
    ? { kind: 'omitted' }
    : { kind: 'count', peopleNeeded };
}

interface CellProblemInput {
  value: string | undefined;
  minimum: number | undefined;
}

function cellProblem({ value, minimum }: CellProblemInput): CellProblem | null {
  const draft = parseDraft({ value });
  if (draft.kind === 'invalid') return 'invalid';
  const count = draft.kind === 'count' ? draft.peopleNeeded : 0;
  return minimum !== undefined && count < minimum ? 'belowMinimum' : null;
}

export interface NormalizeHeadcountGridInput {
  sectors: HeadcountGridCatalogItem[];
  roles: HeadcountGridCatalogItem[];
  shifts: HeadcountGridShift[];
  values: HeadcountGridValues;
  minimums?: HeadcountGridMinimums;
}

export interface NormalizedHeadcountGrid {
  /** Positive counts only, in Shift → Sector → Role order. */
  entries: HeadcountGridEntry[];
  /** Cells a caller must not save: unparsable or below their minimum. */
  invalidKeys: string[];
}

/** Turns drafts into the positive counts a caller persists. */
export function normalizeHeadcountGrid({
  sectors,
  roles,
  shifts,
  values,
  minimums = {},
}: NormalizeHeadcountGridInput): NormalizedHeadcountGrid {
  const result: NormalizedHeadcountGrid = { entries: [], invalidKeys: [] };
  for (const { key: shiftKey } of shifts) {
    for (const { id: sectorId } of sectors) {
      for (const { id: roleId } of roles) {
        const cell = { shiftKey, sectorId, roleId };
        const key = headcountGridKey(cell);
        const value = values[key];
        if (cellProblem({ value, minimum: minimums[key] })) {
          result.invalidKeys.push(key);
          continue;
        }
        const draft = parseDraft({ value });
        if (draft.kind === 'count') {
          result.entries.push({ ...cell, peopleNeeded: draft.peopleNeeded });
        }
      }
    }
  }
  return result;
}

const PROBLEM_MESSAGES: Record<CellProblem, (minimum: number) => string> = {
  invalid: () => m.headcount_grid_invalid(),
  belowMinimum: (minimum) => m.headcount_grid_below_minimum({ minimum }),
};

/**
 * People needed per Shift × Sector × Role. Purely presentational: the caller
 * owns the drafts, persistence, authority and any Cycle state.
 */
export function HeadcountGrid({
  sectors,
  roles,
  shifts,
  values,
  onChange,
  minimums = {},
  disabled = false,
}: HeadcountGridProps) {
  return (
    <div className="space-y-4">
      {shifts.map((shift) => {
        const isEmpty = sectors.every((sector) =>
          roles.every(
            (role) =>
              parseDraft({
                value:
                  values[
                    headcountGridKey({
                      shiftKey: shift.key,
                      sectorId: sector.id,
                      roleId: role.id,
                    })
                  ],
              }).kind !== 'count',
          ),
        );
        return (
          <fieldset
            key={shift.key}
            aria-label={shift.label}
            // A section, not a box: the editor around it is already the card.
            className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0"
          >
            {/* Under the caller's "Pessoas necessárias" h3; one shift needs no name of its own. */}
            {shifts.length > 1 ? (
              <h4 className="font-semibold text-sm">{shift.label}</h4>
            ) : null}
            {isEmpty ? (
              <p className="text-muted-foreground text-sm">
                {m.headcount_grid_empty_shift()}
              </p>
            ) : null}
            {/* One matrix per shift: roles as rows, sectors as columns, so any number of sectors
                stays balanced (no orphan) and a count sits under its sector. Scrolls sideways only
                when there are more sectors than room. */}
            <div className="max-w-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <td />
                    {sectors.map((sector) => (
                      <th
                        key={sector.id}
                        scope="col"
                        className="px-1 pb-1 text-end align-bottom font-medium"
                      >
                        {sector.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => {
                    const cells = sectors.map((sector) => {
                      const cell = {
                        shiftKey: shift.key,
                        sectorId: sector.id,
                        roleId: role.id,
                      };
                      const key = headcountGridKey(cell);
                      const minimum = minimums[key];
                      const problem = cellProblem({
                        value: values[key],
                        minimum,
                      });
                      const inputId = `headcount-${key}`;
                      return {
                        sector,
                        cell,
                        key,
                        minimum,
                        problem,
                        inputId,
                        problemId: `${inputId}-problem`,
                      };
                    });
                    return (
                      <Fragment key={role.id}>
                        <tr>
                          <th
                            scope="row"
                            className="py-1 pe-3 text-start font-normal"
                          >
                            {role.name}
                          </th>
                          {cells.map(
                            ({
                              sector,
                              cell,
                              key,
                              problem,
                              inputId,
                              problemId,
                            }) => (
                              <td key={key} className="py-1 ps-2 text-end">
                                <Input
                                  id={inputId}
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  step={1}
                                  placeholder="0"
                                  // Every count field alike: typed, no native spinners.
                                  className="ms-auto w-16 text-end tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                  aria-label={m.headcount_grid_cell_label({
                                    role: role.name,
                                    sector: sector.name,
                                    shift: shift.label,
                                  })}
                                  aria-invalid={problem ? true : undefined}
                                  aria-describedby={
                                    problem ? problemId : undefined
                                  }
                                  disabled={disabled}
                                  value={values[key] ?? ''}
                                  onChange={(event) =>
                                    onChange({
                                      ...cell,
                                      value: event.target.value,
                                    })
                                  }
                                />
                              </td>
                            ),
                          )}
                        </tr>
                        {cells.some(({ problem }) => problem) ? (
                          <tr>
                            <td
                              colSpan={sectors.length + 1}
                              className="pb-1 text-destructive text-xs"
                            >
                              {cells.map(
                                ({
                                  sector,
                                  key,
                                  minimum,
                                  problem,
                                  problemId,
                                }) =>
                                  problem ? (
                                    <p key={key} id={problemId}>
                                      {sectors.length > 1 ? (
                                        <span className="font-medium">
                                          {sector.name}:{' '}
                                        </span>
                                      ) : null}
                                      <span>
                                        {PROBLEM_MESSAGES[problem](
                                          minimum ?? 0,
                                        )}
                                      </span>
                                    </p>
                                  ) : null,
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

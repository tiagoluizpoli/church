import { m } from '@church/i18n/messages';
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
          <fieldset key={shift.key} className="surface-panel space-y-3 p-3">
            <legend className="px-1 font-medium text-sm">{shift.label}</legend>
            {isEmpty ? (
              <p className="text-muted-foreground text-xs">
                {m.headcount_grid_empty_shift()}
              </p>
            ) : null}
            {sectors.map((sector) => (
              <div key={sector.id} className="space-y-2">
                <p className="font-medium text-muted-foreground text-xs">
                  {sector.name}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {roles.map((role) => {
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
                    const problemId = `${inputId}-problem`;
                    return (
                      <div key={key} className="space-y-1">
                        <label htmlFor={inputId} className="text-xs">
                          {role.name}
                        </label>
                        <Input
                          id={inputId}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1}
                          placeholder="0"
                          aria-label={m.headcount_grid_cell_label({
                            role: role.name,
                            sector: sector.name,
                            shift: shift.label,
                          })}
                          aria-invalid={problem ? true : undefined}
                          aria-describedby={problem ? problemId : undefined}
                          disabled={disabled}
                          value={values[key] ?? ''}
                          onChange={(event) =>
                            onChange({ ...cell, value: event.target.value })
                          }
                        />
                        {problem ? (
                          <p
                            id={problemId}
                            className="text-destructive text-xs"
                          >
                            {PROBLEM_MESSAGES[problem](minimum ?? 0)}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </fieldset>
        );
      })}
    </div>
  );
}

export interface RequireInsertedRowInput<TRow> {
  rows: TRow[];
  description: string;
}

/** A single-row `insert … returning` result, or a named failure instead of `undefined`. */
export function requireInsertedRow<TRow>({
  rows,
  description,
}: RequireInsertedRowInput<TRow>): TRow {
  const [row] = rows;
  if (!row) {
    throw new Error(`Seed builder failed to insert ${description}.`);
  }
  return row;
}

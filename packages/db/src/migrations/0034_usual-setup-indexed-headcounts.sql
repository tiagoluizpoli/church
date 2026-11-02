-- Hand-written (Spec 14.1 #655): UsualSetup headcounts become per Shift.
-- A legacy block-wide headcount applied identically to every Shift of the
-- split, so it becomes one indexed copy per Shift: `count` Shifts for an equal
-- split, one per span for a manual split. Already-indexed rows are left alone.
UPDATE "usual_setup" AS setup
SET "headcounts" = COALESCE(
  (
    SELECT jsonb_agg(
      headcount.value || jsonb_build_object('shiftIndex', shift_index)
      ORDER BY shift_index, headcount.ordinality
    )
    FROM jsonb_array_elements(setup."headcounts") WITH ORDINALITY AS headcount(value, ordinality)
    CROSS JOIN generate_series(
      0,
      CASE setup."shift_split" ->> 'kind'
        WHEN 'equal' THEN (setup."shift_split" ->> 'count')::int
        ELSE jsonb_array_length(setup."shift_split" -> 'spans')
      END - 1
    ) AS shift_index
  ),
  '[]'::jsonb
)
WHERE jsonb_array_length(setup."headcounts") > 0
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(setup."headcounts") AS indexed(value)
    WHERE indexed.value ? 'shiftIndex'
  );

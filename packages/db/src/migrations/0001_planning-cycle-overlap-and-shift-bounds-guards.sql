-- Hand-written via drizzle-kit generate --custom: EXCLUDE constraints and
-- triggers have no schema.ts representation in Drizzle's DSL (confirmed via
-- Drizzle docs) and must be added this way. This reproduces exactly what
-- previously existed in the pre-squash migration history.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "planning_cycle" ADD CONSTRAINT "planning_cycle_church_date_excl" EXCLUDE USING gist (
	"church_id" WITH =,
	daterange("start_date", "end_date", '[)') WITH &&
);
--> statement-breakpoint
CREATE FUNCTION enforce_shift_time_slot_bounds() RETURNS trigger AS $$
DECLARE
	parent_start timestamp with time zone;
	parent_end timestamp with time zone;
BEGIN
	SELECT "start_time", "end_time"
	INTO parent_start, parent_end
	FROM "time_slot"
	WHERE "id" = NEW."time_slot_id";

	IF NEW."start_time" < parent_start OR NEW."end_time" > parent_end THEN
		RAISE EXCEPTION 'shift must be within its time slot bounds';
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "shift_time_slot_bounds_trigger"
BEFORE INSERT OR UPDATE ON "shift"
FOR EACH ROW EXECUTE FUNCTION enforce_shift_time_slot_bounds();

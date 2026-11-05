-- Hand-edited (Spec 19 #695): Cycle end_date becomes the inclusive last
-- CalendarDay. Each stored exclusive end moves to the previous day, so every
-- period keeps exactly the days it covered; no Event is touched. Both guards
-- are dropped first (the old ones reject the converted rows), then reinstalled
-- inclusively under their deployed names. Runs once, inside the migrator's
-- transaction: rows written after it are already inclusive.
ALTER TABLE "cycle" DROP CONSTRAINT "cycle_church_date_excl";--> statement-breakpoint
ALTER TABLE "cycle" DROP CONSTRAINT "cycle_date_check";--> statement-breakpoint
UPDATE "cycle" SET "end_date" = "end_date" - 1;--> statement-breakpoint
ALTER TABLE "cycle" ADD CONSTRAINT "cycle_date_check" CHECK ("cycle"."start_date" <= "cycle"."end_date");--> statement-breakpoint
ALTER TABLE "cycle" ADD CONSTRAINT "cycle_church_date_excl" EXCLUDE USING gist (
	"church_id" WITH =,
	daterange("start_date", "end_date", '[]') WITH &&
);

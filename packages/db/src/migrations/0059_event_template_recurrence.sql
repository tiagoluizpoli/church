-- Each existing template becomes weekly on its weekday; blocks and UsualSetups are untouched.
ALTER TABLE "event_template" ADD COLUMN "recurrence" jsonb;--> statement-breakpoint
UPDATE "event_template" SET "recurrence" = jsonb_build_object('kind', 'weekly', 'weekdays', jsonb_build_array("weekday")) WHERE "recurrence" IS NULL;--> statement-breakpoint
ALTER TABLE "event_template" ALTER COLUMN "recurrence" SET NOT NULL;

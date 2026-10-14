-- Rows of the removed kind cannot be cast to the recreated enum.
DELETE FROM "volunteer_notification" WHERE "type" = 'availability_conflict';--> statement-breakpoint
ALTER TABLE "volunteer_notification" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."volunteer_notification_type";--> statement-breakpoint
CREATE TYPE "public"."volunteer_notification_type" AS ENUM('schedule_published', 'assignment_added', 'assignment_changed', 'assignment_removed', 'availability_reminder', 'assignment_reminder');--> statement-breakpoint
ALTER TABLE "volunteer_notification" ALTER COLUMN "type" SET DATA TYPE "public"."volunteer_notification_type" USING "type"::"public"."volunteer_notification_type";
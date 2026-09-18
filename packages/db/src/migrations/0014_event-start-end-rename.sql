ALTER TABLE "event" RENAME COLUMN "start_date" TO "start";--> statement-breakpoint
ALTER TABLE "event" RENAME COLUMN "end_date" TO "end";--> statement-breakpoint
ALTER TABLE "event" DROP CONSTRAINT "event_date_check";--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_date_check" CHECK ("event"."start" < "event"."end");

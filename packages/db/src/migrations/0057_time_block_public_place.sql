-- rollback-compatible: adds nullable/defaulted columns the previous application ignores
ALTER TABLE "template_time_block" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "template_time_block" ADD COLUMN "place" varchar(120);--> statement-breakpoint
ALTER TABLE "event_time_block" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_time_block" ADD COLUMN "place" varchar(120);
-- rollback-compatible: adds two defaulted columns the previous application ignores
ALTER TABLE "event" ADD COLUMN "is_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_time_block" ADD COLUMN "is_hidden" boolean DEFAULT false NOT NULL;
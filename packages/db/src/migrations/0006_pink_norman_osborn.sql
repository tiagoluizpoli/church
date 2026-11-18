ALTER TABLE "ministry_invitation" ADD COLUMN "last_resend_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ministry_invitation" ADD COLUMN "resend_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ministry_invitation" ADD COLUMN "resend_window_started_at" timestamp with time zone;
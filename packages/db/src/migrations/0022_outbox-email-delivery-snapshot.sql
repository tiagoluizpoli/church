ALTER TABLE "outbox_message" ADD COLUMN "email_request" jsonb;--> statement-breakpoint
ALTER TABLE "outbox_message" ADD COLUMN "email_idempotency_key" text;--> statement-breakpoint
ALTER TABLE "outbox_message" ADD COLUMN "email_first_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "outbox_message" ADD COLUMN "email_delivered_at" timestamp with time zone;
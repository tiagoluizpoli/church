ALTER TYPE "public"."outbox_message_kind" ADD VALUE 'notification';--> statement-breakpoint
ALTER TABLE "outbox_message" ADD COLUMN "channel_outcomes" jsonb;
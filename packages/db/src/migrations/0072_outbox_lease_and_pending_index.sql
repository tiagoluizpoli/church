-- rollback-compatible: adds a nullable column and a partial index; the previous application never reads the column and runs unchanged with the index
ALTER TABLE "outbox_message" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "outbox_message_pending_due_idx" ON "outbox_message" USING btree ("scheduled_for") WHERE "outbox_message"."status" = 'pending';
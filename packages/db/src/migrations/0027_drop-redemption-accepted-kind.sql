DELETE FROM "outbox_message" WHERE "kind" = 'redemption.accepted';--> statement-breakpoint
ALTER TABLE "outbox_message" ALTER COLUMN "kind" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."outbox_message_kind";--> statement-breakpoint
CREATE TYPE "public"."outbox_message_kind" AS ENUM('invitation.chained', 'invitation.church-bootstrap', 'notification');--> statement-breakpoint
ALTER TABLE "outbox_message" ALTER COLUMN "kind" SET DATA TYPE "public"."outbox_message_kind" USING "kind"::"public"."outbox_message_kind";
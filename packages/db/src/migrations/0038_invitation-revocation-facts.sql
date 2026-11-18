CREATE TYPE "public"."invitation_revocation_reason" AS ENUM('manual', 'ministry-archived');--> statement-breakpoint
ALTER TABLE "ministry_invitation" ADD COLUMN "canceled_by_id" text;--> statement-breakpoint
ALTER TABLE "ministry_invitation" ADD COLUMN "cancel_reason" "invitation_revocation_reason";--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "canceled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "canceled_by_id" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "cancel_reason" "invitation_revocation_reason";--> statement-breakpoint
ALTER TABLE "ministry_invitation" ADD CONSTRAINT "ministry_invitation_canceled_by_id_user_id_fk" FOREIGN KEY ("canceled_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_canceled_by_id_user_id_fk" FOREIGN KEY ("canceled_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
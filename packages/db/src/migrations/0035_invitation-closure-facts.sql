ALTER TABLE "ministry_invitation" ADD COLUMN "declined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "accepted_by_id" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "declined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "declined_by_id" text;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_accepted_by_id_user_id_fk" FOREIGN KEY ("accepted_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_declined_by_id_user_id_fk" FOREIGN KEY ("declined_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
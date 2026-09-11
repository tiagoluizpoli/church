CREATE TABLE "volunteer_transfer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source_church_id" uuid NOT NULL,
	"destination_church_id" uuid NOT NULL,
	"source_volunteer_id" uuid NOT NULL,
	"destination_volunteer_id" uuid NOT NULL,
	"ministry_invitation_id" uuid NOT NULL,
	"withdrawn_assignment_count" integer NOT NULL,
	"ended_membership_count" integer NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignment_audit" ADD COLUMN "correlation_id" text;--> statement-breakpoint
ALTER TABLE "ministry_volunteer" ADD COLUMN "left_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "volunteer_transfer" ADD CONSTRAINT "volunteer_transfer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_transfer" ADD CONSTRAINT "volunteer_transfer_source_church_id_church_id_fk" FOREIGN KEY ("source_church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_transfer" ADD CONSTRAINT "volunteer_transfer_destination_church_id_church_id_fk" FOREIGN KEY ("destination_church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_transfer" ADD CONSTRAINT "volunteer_transfer_source_volunteer_id_volunteer_id_fk" FOREIGN KEY ("source_volunteer_id") REFERENCES "public"."volunteer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_transfer" ADD CONSTRAINT "volunteer_transfer_destination_volunteer_id_volunteer_id_fk" FOREIGN KEY ("destination_volunteer_id") REFERENCES "public"."volunteer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_transfer" ADD CONSTRAINT "volunteer_transfer_ministry_invitation_id_ministry_invitation_id_fk" FOREIGN KEY ("ministry_invitation_id") REFERENCES "public"."ministry_invitation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "volunteer_transfer_user_invitation_idx" ON "volunteer_transfer" USING btree ("user_id","ministry_invitation_id");
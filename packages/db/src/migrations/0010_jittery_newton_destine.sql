CREATE TYPE "public"."identity_audit_action" AS ENUM('acceptance', 'decline', 'church_only_partial_acceptance', 'ministry_acceptance', 'volunteer_transfer');--> statement-breakpoint
CREATE TABLE "identity_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"ministry_invitation_id" uuid,
	"actor_id" text NOT NULL,
	"action" "identity_audit_action" NOT NULL,
	"reason" text,
	"correlation_id" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity_audit" ADD CONSTRAINT "identity_audit_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_audit" ADD CONSTRAINT "identity_audit_ministry_invitation_id_ministry_invitation_id_fk" FOREIGN KEY ("ministry_invitation_id") REFERENCES "public"."ministry_invitation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_audit" ADD CONSTRAINT "identity_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
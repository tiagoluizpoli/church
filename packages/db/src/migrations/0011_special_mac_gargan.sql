CREATE TYPE "public"."security_log_event" AS ENUM('identity_mismatch', 'throttled');--> statement-breakpoint
CREATE TABLE "security_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid,
	"ministry_invitation_id" uuid,
	"actor_id" text,
	"event" "security_log_event" NOT NULL,
	"correlation_id" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "security_log" ADD CONSTRAINT "security_log_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_log" ADD CONSTRAINT "security_log_ministry_invitation_id_ministry_invitation_id_fk" FOREIGN KEY ("ministry_invitation_id") REFERENCES "public"."ministry_invitation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_log" ADD CONSTRAINT "security_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
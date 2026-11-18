CREATE TABLE "invitation_verification_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ministry_invitation_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_verification_code_ministry_invitation_id_unique" UNIQUE("ministry_invitation_id")
);
--> statement-breakpoint
ALTER TABLE "invitation_verification_code" ADD CONSTRAINT "invitation_verification_code_ministry_invitation_id_ministry_invitation_id_fk" FOREIGN KEY ("ministry_invitation_id") REFERENCES "public"."ministry_invitation"("id") ON DELETE cascade ON UPDATE no action;
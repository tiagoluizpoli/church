CREATE TABLE "assignment_proposal_application" (
	"church_id" uuid NOT NULL,
	"application_key" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"ministry_id" uuid NOT NULL,
	"review_token" text NOT NULL,
	"additions" jsonb NOT NULL,
	"applied_by" text,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_proposal_application_church_id_application_key_pk" PRIMARY KEY("church_id","application_key")
);
--> statement-breakpoint
ALTER TABLE "assignment_proposal_application" ADD CONSTRAINT "assignment_proposal_application_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_proposal_application" ADD CONSTRAINT "assignment_proposal_application_cycle_id_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_proposal_application" ADD CONSTRAINT "assignment_proposal_application_ministry_id_ministry_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_proposal_application" ADD CONSTRAINT "assignment_proposal_application_applied_by_user_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
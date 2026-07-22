CREATE TABLE "ministry_volunteer_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"ministry_volunteer_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ministry_volunteer_team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"ministry_volunteer_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ministry_volunteer_role" ADD CONSTRAINT "ministry_volunteer_role_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_volunteer_role" ADD CONSTRAINT "ministry_volunteer_role_ministry_volunteer_id_ministry_volunteer_id_fk" FOREIGN KEY ("ministry_volunteer_id") REFERENCES "public"."ministry_volunteer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_volunteer_role" ADD CONSTRAINT "ministry_volunteer_role_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_volunteer_team" ADD CONSTRAINT "ministry_volunteer_team_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_volunteer_team" ADD CONSTRAINT "ministry_volunteer_team_ministry_volunteer_id_ministry_volunteer_id_fk" FOREIGN KEY ("ministry_volunteer_id") REFERENCES "public"."ministry_volunteer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_volunteer_team" ADD CONSTRAINT "ministry_volunteer_team_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ministry_volunteer_role_membership_role_idx" ON "ministry_volunteer_role" USING btree ("ministry_volunteer_id","role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ministry_volunteer_team_membership_team_idx" ON "ministry_volunteer_team" USING btree ("ministry_volunteer_id","team_id");
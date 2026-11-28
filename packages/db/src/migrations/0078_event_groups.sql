-- rollback-compatible: new tables and a nullable ministry column the previous application never reads
CREATE TABLE "event_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"ministry_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_group_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"ministry_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"event_template_id" uuid NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ministry" ADD COLUMN "event_group_catch_all_name" varchar(255);--> statement-breakpoint
ALTER TABLE "event_group" ADD CONSTRAINT "event_group_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_group" ADD CONSTRAINT "event_group_ministry_id_ministry_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_group_template" ADD CONSTRAINT "event_group_template_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_group_template" ADD CONSTRAINT "event_group_template_ministry_id_ministry_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_group_template" ADD CONSTRAINT "event_group_template_group_id_event_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."event_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_group_template" ADD CONSTRAINT "event_group_template_event_template_id_event_template_id_fk" FOREIGN KEY ("event_template_id") REFERENCES "public"."event_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_group_ministry_position_idx" ON "event_group" USING btree ("ministry_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "event_group_template_ministry_template_idx" ON "event_group_template" USING btree ("ministry_id","event_template_id");--> statement-breakpoint
CREATE INDEX "event_group_template_group_idx" ON "event_group_template" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "event_group_template_template_idx" ON "event_group_template" USING btree ("event_template_id");
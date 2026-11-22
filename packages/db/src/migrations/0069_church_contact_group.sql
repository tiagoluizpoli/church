-- rollback-compatible: adds a table and nullable columns the previous application never reads
CREATE TABLE "church_contact_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "church_contact" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "church_social_link" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "church_contact_group" ADD CONSTRAINT "church_contact_group_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "church_contact_group_church_position_idx" ON "church_contact_group" USING btree ("church_id","position");--> statement-breakpoint
ALTER TABLE "church_contact" ADD CONSTRAINT "church_contact_group_id_church_contact_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."church_contact_group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "church_social_link" ADD CONSTRAINT "church_social_link_group_id_church_contact_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."church_contact_group"("id") ON DELETE set null ON UPDATE no action;
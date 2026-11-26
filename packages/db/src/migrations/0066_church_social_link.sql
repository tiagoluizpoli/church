-- rollback-compatible: adds a table the previous application never reads
CREATE TABLE "church_social_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"url" text NOT NULL,
	"network" text NOT NULL,
	"description" text,
	"position" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "church_social_link" ADD CONSTRAINT "church_social_link_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "church_social_link_church_position_idx" ON "church_social_link" USING btree ("church_id","position");
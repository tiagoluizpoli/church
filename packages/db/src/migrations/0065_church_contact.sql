-- rollback-compatible: adds a table the previous application never reads
CREATE TABLE "church_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"phone_type" text,
	"value" text NOT NULL,
	"description" text,
	"is_whatsapp" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "church_contact" ADD CONSTRAINT "church_contact_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "church_contact_church_id_position_idx" ON "church_contact" USING btree ("church_id","position");
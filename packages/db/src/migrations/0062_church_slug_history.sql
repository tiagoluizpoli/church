-- rollback-compatible: adds a table the previous application never reads
CREATE TABLE "church_slug_history" (
	"slug" text PRIMARY KEY NOT NULL,
	"church_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "church_slug_history" ADD CONSTRAINT "church_slug_history_church_id_organization_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "church_slug_history_church_id_idx" ON "church_slug_history" USING btree ("church_id");
CREATE TYPE "public"."template_precedence_outcome" AS ENUM('both', 'a_wins', 'b_wins');--> statement-breakpoint
CREATE TABLE "template_precedence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"template_a_id" uuid NOT NULL,
	"template_b_id" uuid NOT NULL,
	"outcome" "template_precedence_outcome" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_precedence_ordered_pair_check" CHECK ("template_precedence"."template_a_id" < "template_precedence"."template_b_id")
);
--> statement-breakpoint
ALTER TABLE "template_precedence" ADD CONSTRAINT "template_precedence_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_precedence" ADD CONSTRAINT "template_precedence_template_a_id_event_template_id_fk" FOREIGN KEY ("template_a_id") REFERENCES "public"."event_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_precedence" ADD CONSTRAINT "template_precedence_template_b_id_event_template_id_fk" FOREIGN KEY ("template_b_id") REFERENCES "public"."event_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "template_precedence_pair_idx" ON "template_precedence" USING btree ("template_a_id","template_b_id");--> statement-breakpoint
CREATE INDEX "template_precedence_template_b_idx" ON "template_precedence" USING btree ("template_b_id");--> statement-breakpoint
CREATE INDEX "template_precedence_church_idx" ON "template_precedence" USING btree ("church_id");
CREATE TABLE "availability_ask" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"ministry_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"asked_at" timestamp with time zone NOT NULL,
	"answer_by" date,
	"last_reminded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "availability_ask" ADD CONSTRAINT "availability_ask_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_ask" ADD CONSTRAINT "availability_ask_ministry_id_ministry_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_ask" ADD CONSTRAINT "availability_ask_cycle_id_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "availability_ask_church_ministry_cycle_idx" ON "availability_ask" USING btree ("church_id","ministry_id","cycle_id");
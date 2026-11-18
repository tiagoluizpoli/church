CREATE TABLE "schedule_last_told" (
	"church_id" uuid NOT NULL,
	"ministry_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"volunteer_id" uuid NOT NULL,
	"assignments" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedule_last_told" ADD CONSTRAINT "schedule_last_told_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_last_told" ADD CONSTRAINT "schedule_last_told_ministry_id_ministry_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_last_told" ADD CONSTRAINT "schedule_last_told_cycle_id_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_last_told" ADD CONSTRAINT "schedule_last_told_volunteer_id_volunteer_id_fk" FOREIGN KEY ("volunteer_id") REFERENCES "public"."volunteer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_last_told_scope_idx" ON "schedule_last_told" USING btree ("church_id","ministry_id","cycle_id","volunteer_id");
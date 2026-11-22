CREATE TABLE "event_time_block_move" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"event_time_block_id" uuid NOT NULL,
	"previous_start" timestamp with time zone NOT NULL,
	"previous_end" timestamp with time zone NOT NULL,
	"new_start" timestamp with time zone NOT NULL,
	"new_end" timestamp with time zone NOT NULL,
	"moved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_time_block_move" ADD CONSTRAINT "event_time_block_move_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_time_block_move" ADD CONSTRAINT "event_time_block_move_event_time_block_id_event_time_block_id_fk" FOREIGN KEY ("event_time_block_id") REFERENCES "public"."event_time_block"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_time_block_move_block_idx" ON "event_time_block_move" USING btree ("event_time_block_id","moved_at");
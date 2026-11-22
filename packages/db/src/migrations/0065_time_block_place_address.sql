-- rollback-compatible: adds a nullable column and a check the previous application never violates
ALTER TABLE "template_time_block" ADD COLUMN "place_address_id" uuid;--> statement-breakpoint
ALTER TABLE "event_time_block" ADD COLUMN "place_address_id" uuid;--> statement-breakpoint
ALTER TABLE "template_time_block" ADD CONSTRAINT "template_time_block_place_address_id_church_address_id_fk" FOREIGN KEY ("place_address_id") REFERENCES "public"."church_address"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_time_block" ADD CONSTRAINT "event_time_block_place_address_id_church_address_id_fk" FOREIGN KEY ("place_address_id") REFERENCES "public"."church_address"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_time_block" ADD CONSTRAINT "template_time_block_place_check" CHECK ("template_time_block"."place" IS NULL OR "template_time_block"."place_address_id" IS NULL);--> statement-breakpoint
ALTER TABLE "event_time_block" ADD CONSTRAINT "event_time_block_place_check" CHECK ("event_time_block"."place" IS NULL OR "event_time_block"."place_address_id" IS NULL);
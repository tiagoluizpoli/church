ALTER TABLE "volunteer" DROP CONSTRAINT "volunteer_user_id_unique";--> statement-breakpoint
ALTER TABLE "volunteer" ADD COLUMN "left_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "volunteer" ADD COLUMN "successor_volunteer_id" uuid;--> statement-breakpoint
ALTER TABLE "volunteer" ADD CONSTRAINT "volunteer_successor_volunteer_id_volunteer_id_fk" FOREIGN KEY ("successor_volunteer_id") REFERENCES "public"."volunteer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "volunteer_user_id_active_idx" ON "volunteer" USING btree ("user_id") WHERE "volunteer"."left_at" IS NULL;

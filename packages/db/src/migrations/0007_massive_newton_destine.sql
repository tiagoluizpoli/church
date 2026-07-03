CREATE TYPE "public"."availability_check_state" AS ENUM('pending', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."default_direction" AS ENUM('all_in', 'all_out');--> statement-breakpoint
CREATE TYPE "public"."participation_state" AS ENUM('tailoring', 'availability_fired', 'rostering', 'published');--> statement-breakpoint
CREATE TYPE "public"."planning_cycle_state" AS ENUM('draft', 'locked', 'archived');--> statement-breakpoint
DO $$ BEGIN
	CREATE TYPE "public"."event_type" AS ENUM('hourly', 'day_based');
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE "availability_check" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"planning_cycle_id" uuid NOT NULL,
	"ministry_volunteer_id" uuid NOT NULL,
	"state" "availability_check_state" DEFAULT 'pending' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "church_admin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ministry_participation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"ministry_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"state" "participation_state" DEFAULT 'tailoring' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participation_slot_inclusion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"participation_id" uuid NOT NULL,
	"time_slot_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"weekday" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_template_weekday_check" CHECK ("event_template"."weekday" >= 0 AND "event_template"."weekday" <= 6)
);
--> statement-breakpoint
CREATE TABLE "ministry_serving_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"ministry_id" uuid NOT NULL,
	"source_template_block_id" uuid NOT NULL,
	"serves" boolean DEFAULT true NOT NULL,
	"shift_split" jsonb NOT NULL,
	"headcounts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planning_cycle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"state" "planning_cycle_state" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_cycle_date_check" CHECK ("planning_cycle"."start_date" < "planning_cycle"."end_date")
);
--> statement-breakpoint
CREATE TABLE "time_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"label" varchar(255) NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"order" integer NOT NULL,
	CONSTRAINT "time_block_time_check" CHECK ("time_block"."start_time" < "time_block"."end_time")
);
--> statement-breakpoint
CREATE TABLE "shift" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"participation_id" uuid NOT NULL,
	"time_slot_id" uuid NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"label" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_duration_check" CHECK ("shift"."start_time" < "shift"."end_time")
);
--> statement-breakpoint
ALTER TABLE "availability" DROP CONSTRAINT "availability_time_check";--> statement-breakpoint
ALTER TABLE "assignment" DROP CONSTRAINT "assignment_slot_id_time_slot_id_fk";
--> statement-breakpoint
ALTER TABLE "availability" DROP CONSTRAINT "availability_volunteer_id_volunteer_id_fk";
--> statement-breakpoint
ALTER TABLE "availability" DROP CONSTRAINT "availability_event_id_event_id_fk";
--> statement-breakpoint
ALTER TABLE "event" DROP CONSTRAINT "event_ministry_id_ministry_id_fk";
--> statement-breakpoint
ALTER TABLE "slot_requirement" DROP CONSTRAINT "slot_requirement_slot_id_time_slot_id_fk";
--> statement-breakpoint
DROP INDEX "assignment_slot_volunteer_idx";--> statement-breakpoint
ALTER TABLE "assignment" DROP CONSTRAINT "assignment_status_check";--> statement-breakpoint
ALTER TABLE "assignment" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "assignment" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint
DROP TYPE "public"."assignment_status";--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('draft', 'pending', 'confirmed', 'declined', 'cancelled');--> statement-breakpoint
ALTER TABLE "assignment" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."assignment_status";--> statement-breakpoint
ALTER TABLE "assignment" ALTER COLUMN "status" SET DATA TYPE "public"."assignment_status" USING "status"::"public"."assignment_status";--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_status_check" CHECK ("assignment"."status" IN ('draft', 'pending', 'confirmed', 'declined', 'cancelled'));--> statement-breakpoint
ALTER TABLE "event" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "event" ALTER COLUMN "status" SET DEFAULT 'draft'::text;--> statement-breakpoint
DROP TYPE "public"."event_status";--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'scheduled', 'cancelled', 'past');--> statement-breakpoint
ALTER TABLE "event" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."event_status";--> statement-breakpoint
ALTER TABLE "event" ALTER COLUMN "status" SET DATA TYPE "public"."event_status" USING "status"::"public"."event_status";--> statement-breakpoint
DROP INDEX "availability_church_volunteer_event_idx";--> statement-breakpoint
ALTER TABLE "assignment" ADD COLUMN "participation_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment" ADD COLUMN "shift_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "availability" ADD COLUMN "availability_check_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "availability" ADD COLUMN "shift_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "availability" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ministry" ADD COLUMN "default_direction" "default_direction" DEFAULT 'all_out' NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "planning_cycle_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "source_template_id" uuid;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN IF NOT EXISTS "event_type" "event_type" DEFAULT 'hourly' NOT NULL;--> statement-breakpoint
ALTER TABLE "slot_requirement" ADD COLUMN "participation_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "slot_requirement" ADD COLUMN "shift_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "time_slot" ADD COLUMN "source_template_block_id" uuid;--> statement-breakpoint
ALTER TABLE "volunteer_notification" ADD COLUMN "planning_cycle_id" uuid;--> statement-breakpoint
ALTER TABLE "availability_check" ADD CONSTRAINT "availability_check_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_check" ADD CONSTRAINT "availability_check_planning_cycle_id_planning_cycle_id_fk" FOREIGN KEY ("planning_cycle_id") REFERENCES "public"."planning_cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_check" ADD CONSTRAINT "availability_check_ministry_volunteer_id_ministry_volunteer_id_fk" FOREIGN KEY ("ministry_volunteer_id") REFERENCES "public"."ministry_volunteer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "church_admin" ADD CONSTRAINT "church_admin_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "church_admin" ADD CONSTRAINT "church_admin_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_participation" ADD CONSTRAINT "ministry_participation_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_participation" ADD CONSTRAINT "ministry_participation_ministry_id_ministry_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_participation" ADD CONSTRAINT "ministry_participation_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_slot_inclusion" ADD CONSTRAINT "participation_slot_inclusion_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_slot_inclusion" ADD CONSTRAINT "participation_slot_inclusion_participation_id_ministry_participation_id_fk" FOREIGN KEY ("participation_id") REFERENCES "public"."ministry_participation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_slot_inclusion" ADD CONSTRAINT "participation_slot_inclusion_time_slot_id_time_slot_id_fk" FOREIGN KEY ("time_slot_id") REFERENCES "public"."time_slot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_template" ADD CONSTRAINT "event_template_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_serving_profile" ADD CONSTRAINT "ministry_serving_profile_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_serving_profile" ADD CONSTRAINT "ministry_serving_profile_ministry_id_ministry_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_serving_profile" ADD CONSTRAINT "ministry_serving_profile_source_template_block_id_time_block_id_fk" FOREIGN KEY ("source_template_block_id") REFERENCES "public"."time_block"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_cycle" ADD CONSTRAINT "planning_cycle_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_block" ADD CONSTRAINT "time_block_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_block" ADD CONSTRAINT "time_block_template_id_event_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."event_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_participation_id_ministry_participation_id_fk" FOREIGN KEY ("participation_id") REFERENCES "public"."ministry_participation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_time_slot_id_time_slot_id_fk" FOREIGN KEY ("time_slot_id") REFERENCES "public"."time_slot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "availability_check_cycle_membership_idx" ON "availability_check" USING btree ("planning_cycle_id","ministry_volunteer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "church_admin_church_user_idx" ON "church_admin" USING btree ("church_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participation_ministry_event_idx" ON "ministry_participation" USING btree ("ministry_id","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "participation_slot_inclusion_idx" ON "participation_slot_inclusion" USING btree ("participation_id","time_slot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_template_church_name_idx" ON "event_template" USING btree ("church_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "serving_profile_ministry_block_idx" ON "ministry_serving_profile" USING btree ("ministry_id","source_template_block_id");--> statement-breakpoint
CREATE INDEX "planning_cycle_church_state_idx" ON "planning_cycle" USING btree ("church_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "time_block_template_order_idx" ON "time_block" USING btree ("template_id","order");--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_participation_id_ministry_participation_id_fk" FOREIGN KEY ("participation_id") REFERENCES "public"."ministry_participation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_availability_check_id_availability_check_id_fk" FOREIGN KEY ("availability_check_id") REFERENCES "public"."availability_check"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_planning_cycle_id_planning_cycle_id_fk" FOREIGN KEY ("planning_cycle_id") REFERENCES "public"."planning_cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_source_template_id_event_template_id_fk" FOREIGN KEY ("source_template_id") REFERENCES "public"."event_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_requirement" ADD CONSTRAINT "slot_requirement_participation_id_ministry_participation_id_fk" FOREIGN KEY ("participation_id") REFERENCES "public"."ministry_participation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slot_requirement" ADD CONSTRAINT "slot_requirement_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_slot" ADD CONSTRAINT "time_slot_source_template_block_id_time_block_id_fk" FOREIGN KEY ("source_template_block_id") REFERENCES "public"."time_block"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteer_notification" ADD CONSTRAINT "volunteer_notification_planning_cycle_id_planning_cycle_id_fk" FOREIGN KEY ("planning_cycle_id") REFERENCES "public"."planning_cycle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_shift_volunteer_idx" ON "assignment" USING btree ("shift_id","volunteer_id") WHERE "assignment"."status" IN ('draft', 'pending', 'confirmed');--> statement-breakpoint
CREATE UNIQUE INDEX "availability_check_shift_idx" ON "availability" USING btree ("availability_check_id","shift_id");--> statement-breakpoint
ALTER TABLE "assignment" DROP COLUMN "slot_id";--> statement-breakpoint
ALTER TABLE "availability" DROP COLUMN "volunteer_id";--> statement-breakpoint
ALTER TABLE "availability" DROP COLUMN "event_id";--> statement-breakpoint
ALTER TABLE "availability" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "availability" DROP COLUMN "start_time";--> statement-breakpoint
ALTER TABLE "availability" DROP COLUMN "end_time";--> statement-breakpoint
ALTER TABLE "availability" DROP COLUMN "is_all_day";--> statement-breakpoint
ALTER TABLE "availability" DROP COLUMN "reason";--> statement-breakpoint
ALTER TABLE "availability" DROP COLUMN "repeat_rule";--> statement-breakpoint
ALTER TABLE "event" DROP COLUMN "ministry_id";--> statement-breakpoint
ALTER TABLE "slot_requirement" DROP COLUMN "slot_id";--> statement-breakpoint
DROP TYPE "public"."availability_type";
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "planning_cycle" ADD CONSTRAINT "planning_cycle_church_date_excl" EXCLUDE USING gist (
	"church_id" WITH =,
	daterange("start_date", "end_date", '[)') WITH &&
);
--> statement-breakpoint
CREATE FUNCTION enforce_shift_time_slot_bounds() RETURNS trigger AS $$
DECLARE
	parent_start timestamp with time zone;
	parent_end timestamp with time zone;
BEGIN
	SELECT "start_time", "end_time"
	INTO parent_start, parent_end
	FROM "time_slot"
	WHERE "id" = NEW."time_slot_id";

	IF NEW."start_time" < parent_start OR NEW."end_time" > parent_end THEN
		RAISE EXCEPTION 'shift must be within its time slot bounds';
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "shift_time_slot_bounds_trigger"
BEFORE INSERT OR UPDATE ON "shift"
FOR EACH ROW EXECUTE FUNCTION enforce_shift_time_slot_bounds();

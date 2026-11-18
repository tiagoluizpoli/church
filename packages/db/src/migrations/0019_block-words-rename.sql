-- Hand-written (Spec 04 #483): drizzle-kit's rename prompt needs a TTY.
-- Renames tables, columns, PKs, FKs, indexes and checks to the glossary words,
-- re-points the shift-bounds trigger at the renamed table/column, and rewrites
-- each UsualSetup headcount item's `count` key to `peopleNeeded`.
ALTER TABLE "time_slot" RENAME TO "event_time_block";--> statement-breakpoint
ALTER TABLE "time_block" RENAME TO "template_time_block";--> statement-breakpoint
ALTER TABLE "slot_requirement" RENAME TO "shift_requirement";--> statement-breakpoint
ALTER TABLE "ministry_serving_profile" RENAME TO "usual_setup";--> statement-breakpoint
ALTER TABLE "availability" RENAME TO "unavailable_shift";--> statement-breakpoint
ALTER TABLE "participation_slot_inclusion" RENAME TO "participation_event_time_block_inclusion";--> statement-breakpoint
ALTER TABLE "ministry_volunteer" RENAME TO "ministry_membership";--> statement-breakpoint
ALTER TABLE "ministry_volunteer_role" RENAME TO "ministry_membership_role";--> statement-breakpoint
ALTER TABLE "ministry_volunteer_team" RENAME TO "ministry_membership_team";--> statement-breakpoint
ALTER TABLE "event_time_block" RENAME CONSTRAINT "time_slot_pkey" TO "event_time_block_pkey";--> statement-breakpoint
ALTER TABLE "template_time_block" RENAME CONSTRAINT "time_block_pkey" TO "template_time_block_pkey";--> statement-breakpoint
ALTER TABLE "shift_requirement" RENAME CONSTRAINT "slot_requirement_pkey" TO "shift_requirement_pkey";--> statement-breakpoint
ALTER TABLE "usual_setup" RENAME CONSTRAINT "ministry_serving_profile_pkey" TO "usual_setup_pkey";--> statement-breakpoint
ALTER TABLE "unavailable_shift" RENAME CONSTRAINT "availability_pkey" TO "unavailable_shift_pkey";--> statement-breakpoint
ALTER TABLE "participation_event_time_block_inclusion" RENAME CONSTRAINT "participation_slot_inclusion_pkey" TO "participation_event_time_block_inclusion_pkey";--> statement-breakpoint
ALTER TABLE "ministry_membership" RENAME CONSTRAINT "ministry_volunteer_pkey" TO "ministry_membership_pkey";--> statement-breakpoint
ALTER TABLE "ministry_membership_role" RENAME CONSTRAINT "ministry_volunteer_role_pkey" TO "ministry_membership_role_pkey";--> statement-breakpoint
ALTER TABLE "ministry_membership_team" RENAME CONSTRAINT "ministry_volunteer_team_pkey" TO "ministry_membership_team_pkey";--> statement-breakpoint
ALTER TABLE "availability_check" RENAME COLUMN "ministry_volunteer_id" TO "ministry_membership_id";--> statement-breakpoint
ALTER TABLE "usual_setup" RENAME COLUMN "source_template_block_id" TO "source_template_time_block_id";--> statement-breakpoint
ALTER TABLE "ministry_membership_role" RENAME COLUMN "ministry_volunteer_id" TO "ministry_membership_id";--> statement-breakpoint
ALTER TABLE "ministry_membership_team" RENAME COLUMN "ministry_volunteer_id" TO "ministry_membership_id";--> statement-breakpoint
ALTER TABLE "participation_event_time_block_inclusion" RENAME COLUMN "time_slot_id" TO "event_time_block_id";--> statement-breakpoint
ALTER TABLE "shift" RENAME COLUMN "time_slot_id" TO "event_time_block_id";--> statement-breakpoint
ALTER TABLE "shift_requirement" RENAME COLUMN "required_count" TO "people_needed";--> statement-breakpoint
ALTER TABLE "event_time_block" RENAME COLUMN "source_template_block_id" TO "source_template_time_block_id";--> statement-breakpoint
ALTER TABLE "unavailable_shift" RENAME CONSTRAINT "availability_church_id_church_id_fk" TO "unavailable_shift_church_id_church_id_fk";--> statement-breakpoint
ALTER TABLE "unavailable_shift" RENAME CONSTRAINT "availability_availability_check_id_availability_check_id_fk" TO "unavailable_shift_availability_check_id_availability_check_id_fk";--> statement-breakpoint
ALTER TABLE "unavailable_shift" RENAME CONSTRAINT "availability_shift_id_shift_id_fk" TO "unavailable_shift_shift_id_shift_id_fk";--> statement-breakpoint
ALTER INDEX "availability_check_shift_idx" RENAME TO "unavailable_shift_check_shift_idx";--> statement-breakpoint
ALTER TABLE "availability_check" RENAME CONSTRAINT "availability_check_ministry_volunteer_id_ministry_volunteer_id_fk" TO "availability_check_ministry_membership_id_ministry_membership_id_fk";--> statement-breakpoint
ALTER TABLE "usual_setup" RENAME CONSTRAINT "ministry_serving_profile_church_id_church_id_fk" TO "usual_setup_church_id_church_id_fk";--> statement-breakpoint
ALTER TABLE "usual_setup" RENAME CONSTRAINT "ministry_serving_profile_ministry_id_ministry_id_fk" TO "usual_setup_ministry_id_ministry_id_fk";--> statement-breakpoint
ALTER TABLE "usual_setup" RENAME CONSTRAINT "ministry_serving_profile_source_template_block_id_time_block_id_fk" TO "usual_setup_source_template_time_block_id_template_time_block_id_fk";--> statement-breakpoint
ALTER INDEX "serving_profile_ministry_block_idx" RENAME TO "usual_setup_ministry_block_idx";--> statement-breakpoint
ALTER TABLE "ministry_membership" RENAME CONSTRAINT "ministry_volunteer_church_id_church_id_fk" TO "ministry_membership_church_id_church_id_fk";--> statement-breakpoint
ALTER TABLE "ministry_membership" RENAME CONSTRAINT "ministry_volunteer_volunteer_id_volunteer_id_fk" TO "ministry_membership_volunteer_id_volunteer_id_fk";--> statement-breakpoint
ALTER TABLE "ministry_membership" RENAME CONSTRAINT "ministry_volunteer_ministry_id_ministry_id_fk" TO "ministry_membership_ministry_id_ministry_id_fk";--> statement-breakpoint
ALTER TABLE "ministry_membership_role" RENAME CONSTRAINT "ministry_volunteer_role_church_id_church_id_fk" TO "ministry_membership_role_church_id_church_id_fk";--> statement-breakpoint
ALTER TABLE "ministry_membership_role" RENAME CONSTRAINT "ministry_volunteer_role_ministry_volunteer_id_ministry_volunteer_id_fk" TO "ministry_membership_role_ministry_membership_id_ministry_membership_id_fk";--> statement-breakpoint
ALTER TABLE "ministry_membership_role" RENAME CONSTRAINT "ministry_volunteer_role_role_id_role_id_fk" TO "ministry_membership_role_role_id_role_id_fk";--> statement-breakpoint
ALTER INDEX "ministry_volunteer_role_membership_role_idx" RENAME TO "ministry_membership_role_membership_role_idx";--> statement-breakpoint
ALTER TABLE "ministry_membership_team" RENAME CONSTRAINT "ministry_volunteer_team_church_id_church_id_fk" TO "ministry_membership_team_church_id_church_id_fk";--> statement-breakpoint
ALTER TABLE "ministry_membership_team" RENAME CONSTRAINT "ministry_volunteer_team_ministry_volunteer_id_ministry_volunteer_id_fk" TO "ministry_membership_team_ministry_membership_id_ministry_membership_id_fk";--> statement-breakpoint
ALTER TABLE "ministry_membership_team" RENAME CONSTRAINT "ministry_volunteer_team_team_id_team_id_fk" TO "ministry_membership_team_team_id_team_id_fk";--> statement-breakpoint
ALTER INDEX "ministry_volunteer_team_membership_team_idx" RENAME TO "ministry_membership_team_membership_team_idx";--> statement-breakpoint
ALTER TABLE "participation_event_time_block_inclusion" RENAME CONSTRAINT "participation_slot_inclusion_church_id_church_id_fk" TO "participation_event_time_block_inclusion_church_id_church_id_fk";--> statement-breakpoint
ALTER TABLE "participation_event_time_block_inclusion" RENAME CONSTRAINT "participation_slot_inclusion_participation_id_ministry_participation_id_fk" TO "participation_event_time_block_inclusion_participation_id_ministry_participation_id_fk";--> statement-breakpoint
ALTER TABLE "participation_event_time_block_inclusion" RENAME CONSTRAINT "participation_slot_inclusion_time_slot_id_time_slot_id_fk" TO "participation_event_time_block_inclusion_event_time_block_id_event_time_block_id_fk";--> statement-breakpoint
ALTER INDEX "participation_slot_inclusion_idx" RENAME TO "participation_event_time_block_inclusion_idx";--> statement-breakpoint
ALTER TABLE "shift" RENAME CONSTRAINT "shift_time_slot_id_time_slot_id_fk" TO "shift_event_time_block_id_event_time_block_id_fk";--> statement-breakpoint
ALTER TABLE "shift_requirement" RENAME CONSTRAINT "slot_requirement_church_id_church_id_fk" TO "shift_requirement_church_id_church_id_fk";--> statement-breakpoint
ALTER TABLE "shift_requirement" RENAME CONSTRAINT "slot_requirement_participation_id_ministry_participation_id_fk" TO "shift_requirement_participation_id_ministry_participation_id_fk";--> statement-breakpoint
ALTER TABLE "shift_requirement" RENAME CONSTRAINT "slot_requirement_shift_id_shift_id_fk" TO "shift_requirement_shift_id_shift_id_fk";--> statement-breakpoint
ALTER TABLE "shift_requirement" RENAME CONSTRAINT "slot_requirement_role_id_role_id_fk" TO "shift_requirement_role_id_role_id_fk";--> statement-breakpoint
ALTER TABLE "shift_requirement" RENAME CONSTRAINT "slot_requirement_team_id_team_id_fk" TO "shift_requirement_team_id_team_id_fk";--> statement-breakpoint
ALTER TABLE "shift_requirement" RENAME CONSTRAINT "slot_requirement_min_count_check" TO "shift_requirement_min_people_needed_check";--> statement-breakpoint
ALTER TABLE "template_time_block" RENAME CONSTRAINT "time_block_church_id_church_id_fk" TO "template_time_block_church_id_church_id_fk";--> statement-breakpoint
ALTER TABLE "template_time_block" RENAME CONSTRAINT "time_block_template_id_event_template_id_fk" TO "template_time_block_template_id_event_template_id_fk";--> statement-breakpoint
ALTER INDEX "time_block_template_order_idx" RENAME TO "template_time_block_template_order_idx";--> statement-breakpoint
ALTER TABLE "template_time_block" RENAME CONSTRAINT "time_block_time_not_empty_check" TO "template_time_block_time_not_empty_check";--> statement-breakpoint
ALTER TABLE "event_time_block" RENAME CONSTRAINT "time_slot_church_id_church_id_fk" TO "event_time_block_church_id_church_id_fk";--> statement-breakpoint
ALTER TABLE "event_time_block" RENAME CONSTRAINT "time_slot_event_id_event_id_fk" TO "event_time_block_event_id_event_id_fk";--> statement-breakpoint
ALTER TABLE "event_time_block" RENAME CONSTRAINT "time_slot_source_template_block_id_time_block_id_fk" TO "event_time_block_source_template_time_block_id_template_time_block_id_fk";--> statement-breakpoint
ALTER TABLE "event_time_block" RENAME CONSTRAINT "timeslot_duration_check" TO "event_time_block_duration_check";--> statement-breakpoint
ALTER TRIGGER "shift_time_slot_bounds_trigger" ON "shift" RENAME TO "shift_event_time_block_bounds_trigger";--> statement-breakpoint
ALTER FUNCTION enforce_shift_time_slot_bounds() RENAME TO enforce_shift_event_time_block_bounds;--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_shift_event_time_block_bounds() RETURNS trigger AS $$
DECLARE
	parent_start timestamp with time zone;
	parent_end timestamp with time zone;
BEGIN
	SELECT "start_time", "end_time"
	INTO parent_start, parent_end
	FROM "event_time_block"
	WHERE "id" = NEW."event_time_block_id";

	IF NEW."start_time" < parent_start OR NEW."end_time" > parent_end THEN
		RAISE EXCEPTION 'shift must be within its event time block bounds';
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
UPDATE "usual_setup" SET "headcounts" = (
	SELECT coalesce(jsonb_agg((h.item - 'count') || jsonb_build_object('peopleNeeded', h.item -> 'count') ORDER BY h.ord), '[]'::jsonb)
	FROM jsonb_array_elements("usual_setup"."headcounts") WITH ORDINALITY AS h(item, ord)
)
WHERE jsonb_path_exists("headcounts", '$[*] ? (exists(@.count))');

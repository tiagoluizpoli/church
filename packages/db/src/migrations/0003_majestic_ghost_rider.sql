ALTER TABLE "team" DROP CONSTRAINT "team_leader_id_volunteer_id_fk";
--> statement-breakpoint
ALTER TABLE "team" DROP COLUMN "leader_id";--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_status_check" CHECK ("assignment"."status" IN ('pending', 'confirmed', 'declined'));--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_time_check" CHECK ("availability"."start_time" < "availability"."end_time");--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_date_check" CHECK ("event"."start_date" < "event"."end_date");--> statement-breakpoint
ALTER TABLE "slot_requirement" ADD CONSTRAINT "slot_requirement_min_count_check" CHECK ("slot_requirement"."required_count" >= 1);--> statement-breakpoint
ALTER TABLE "time_slot" ADD CONSTRAINT "timeslot_duration_check" CHECK ("time_slot"."start_time" < "time_slot"."end_time");
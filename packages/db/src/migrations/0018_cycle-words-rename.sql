-- Hand-written (Spec 03 #474): drizzle-kit's rename prompt needs a TTY.
-- Renames only; no data step (no production data).
ALTER TABLE "planning_cycle" RENAME TO "cycle";--> statement-breakpoint
ALTER TABLE "cycle" RENAME CONSTRAINT "planning_cycle_pkey" TO "cycle_pkey";--> statement-breakpoint
ALTER TABLE "cycle" RENAME CONSTRAINT "planning_cycle_date_check" TO "cycle_date_check";--> statement-breakpoint
ALTER TABLE "cycle" RENAME CONSTRAINT "planning_cycle_church_date_excl" TO "cycle_church_date_excl";--> statement-breakpoint
ALTER TABLE "cycle" RENAME CONSTRAINT "planning_cycle_church_id_church_id_fk" TO "cycle_church_id_church_id_fk";--> statement-breakpoint
ALTER INDEX "planning_cycle_church_state_idx" RENAME TO "cycle_church_state_idx";--> statement-breakpoint
ALTER TYPE "public"."planning_cycle_state" RENAME TO "cycle_state";--> statement-breakpoint
ALTER TYPE "public"."cycle_state" RENAME VALUE 'locked' TO 'sent';--> statement-breakpoint
ALTER TYPE "public"."cycle_state" RENAME VALUE 'archived' TO 'past';--> statement-breakpoint
ALTER TYPE "public"."participation_state" RENAME VALUE 'tailoring' TO 'preparing';--> statement-breakpoint
ALTER TYPE "public"."participation_state" RENAME VALUE 'availability_fired' TO 'availability_requested';--> statement-breakpoint
ALTER TYPE "public"."participation_state" RENAME VALUE 'rostering' TO 'assigning';--> statement-breakpoint
ALTER TABLE "event" RENAME COLUMN "planning_cycle_id" TO "cycle_id";--> statement-breakpoint
ALTER TABLE "event" RENAME CONSTRAINT "event_planning_cycle_id_planning_cycle_id_fk" TO "event_cycle_id_cycle_id_fk";--> statement-breakpoint
ALTER TABLE "availability_check" RENAME COLUMN "planning_cycle_id" TO "cycle_id";--> statement-breakpoint
ALTER TABLE "availability_check" RENAME CONSTRAINT "availability_check_planning_cycle_id_planning_cycle_id_fk" TO "availability_check_cycle_id_cycle_id_fk";--> statement-breakpoint
ALTER TABLE "volunteer_notification" RENAME COLUMN "planning_cycle_id" TO "cycle_id";--> statement-breakpoint
ALTER TABLE "volunteer_notification" RENAME CONSTRAINT "volunteer_notification_planning_cycle_id_planning_cycle_id_fk" TO "volunteer_notification_cycle_id_cycle_id_fk";

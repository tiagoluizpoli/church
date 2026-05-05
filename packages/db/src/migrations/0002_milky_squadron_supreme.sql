CREATE TYPE "public"."assignment_status" AS ENUM('pending', 'confirmed', 'declined');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('created', 'updated', 'deleted', 'status_change');--> statement-breakpoint
CREATE TYPE "public"."availability_type" AS ENUM('available', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."enforcement_type" AS ENUM('soft', 'hard');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."system_role" AS ENUM('leader', 'sub_leader', 'volunteer');--> statement-breakpoint
CREATE TYPE "public"."volunteer_status" AS ENUM('active', 'inactive', 'on_hold');--> statement-breakpoint
ALTER TABLE "assignment" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."assignment_status";--> statement-breakpoint
ALTER TABLE "assignment" ALTER COLUMN "status" SET DATA TYPE "public"."assignment_status" USING "status"::"public"."assignment_status";--> statement-breakpoint
ALTER TABLE "availability" ALTER COLUMN "type" SET DEFAULT 'unavailable'::"public"."availability_type";--> statement-breakpoint
ALTER TABLE "availability" ALTER COLUMN "type" SET DATA TYPE "public"."availability_type" USING "type"::"public"."availability_type";--> statement-breakpoint
ALTER TABLE "ministry" ALTER COLUMN "enforcement_type" SET DEFAULT 'soft'::"public"."enforcement_type";--> statement-breakpoint
ALTER TABLE "ministry" ALTER COLUMN "enforcement_type" SET DATA TYPE "public"."enforcement_type" USING "enforcement_type"::"public"."enforcement_type";--> statement-breakpoint
ALTER TABLE "ministry_volunteer" ALTER COLUMN "system_role" SET DEFAULT 'volunteer'::"public"."system_role";--> statement-breakpoint
ALTER TABLE "ministry_volunteer" ALTER COLUMN "system_role" SET DATA TYPE "public"."system_role" USING "system_role"::"public"."system_role";--> statement-breakpoint
ALTER TABLE "ministry_volunteer" ALTER COLUMN "status" SET DEFAULT 'active'::"public"."membership_status";--> statement-breakpoint
ALTER TABLE "ministry_volunteer" ALTER COLUMN "status" SET DATA TYPE "public"."membership_status" USING "status"::"public"."membership_status";--> statement-breakpoint
ALTER TABLE "volunteer" ALTER COLUMN "status" SET DEFAULT 'active'::"public"."volunteer_status";--> statement-breakpoint
ALTER TABLE "volunteer" ALTER COLUMN "status" SET DATA TYPE "public"."volunteer_status" USING "status"::"public"."volunteer_status";--> statement-breakpoint
ALTER TABLE "event" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."event_status";--> statement-breakpoint
ALTER TABLE "event" ALTER COLUMN "status" SET DATA TYPE "public"."event_status" USING "status"::"public"."event_status";--> statement-breakpoint
ALTER TABLE "assignment_audit" ADD COLUMN "action" "audit_action" NOT NULL;
UPDATE "assignment" SET "status" = 'pending' WHERE "status" = 'confirmed';--> statement-breakpoint
DROP INDEX "assignment_shift_volunteer_idx";--> statement-breakpoint
ALTER TABLE "assignment" DROP CONSTRAINT "assignment_status_check";--> statement-breakpoint
ALTER TABLE "assignment" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "assignment" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint
DROP TYPE "public"."assignment_status";--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('draft', 'pending', 'cancelled');--> statement-breakpoint
ALTER TABLE "assignment" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."assignment_status";--> statement-breakpoint
ALTER TABLE "assignment" ALTER COLUMN "status" SET DATA TYPE "public"."assignment_status" USING "status"::"public"."assignment_status";--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_status_check" CHECK ("assignment"."status" IN ('draft', 'pending', 'cancelled'));--> statement-breakpoint
CREATE UNIQUE INDEX "assignment_shift_volunteer_idx" ON "assignment" USING btree ("shift_id","volunteer_id") WHERE "assignment"."status" IN ('draft', 'pending');

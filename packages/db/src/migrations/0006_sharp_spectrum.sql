DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'volunteer_notification_type'
  ) THEN
    CREATE TYPE "public"."volunteer_notification_type" AS ENUM(
      'schedule_published',
      'assignment_added',
      'assignment_changed',
      'assignment_removed',
      'availability_reminder',
      'assignment_reminder'
    );
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "availability"
ADD COLUMN IF NOT EXISTS "event_id" uuid;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "volunteer_notification" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "church_id" uuid NOT NULL,
  "volunteer_id" uuid NOT NULL,
  "ministry_id" uuid,
  "event_id" uuid,
  "assignment_id" uuid,
  "type" "volunteer_notification_type" NOT NULL,
  "title" varchar(255) NOT NULL,
  "body" text NOT NULL,
  "payload" jsonb NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'availability_event_id_event_id_fk'
  ) THEN
    ALTER TABLE "availability"
    ADD CONSTRAINT "availability_event_id_event_id_fk"
    FOREIGN KEY ("event_id")
    REFERENCES "public"."event"("id")
    ON DELETE cascade
    ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'volunteer_notification_church_id_church_id_fk'
  ) THEN
    ALTER TABLE "volunteer_notification"
    ADD CONSTRAINT "volunteer_notification_church_id_church_id_fk"
    FOREIGN KEY ("church_id")
    REFERENCES "public"."church"("id")
    ON DELETE cascade
    ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'volunteer_notification_volunteer_id_volunteer_id_fk'
  ) THEN
    ALTER TABLE "volunteer_notification"
    ADD CONSTRAINT "volunteer_notification_volunteer_id_volunteer_id_fk"
    FOREIGN KEY ("volunteer_id")
    REFERENCES "public"."volunteer"("id")
    ON DELETE cascade
    ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'volunteer_notification_ministry_id_ministry_id_fk'
  ) THEN
    ALTER TABLE "volunteer_notification"
    ADD CONSTRAINT "volunteer_notification_ministry_id_ministry_id_fk"
    FOREIGN KEY ("ministry_id")
    REFERENCES "public"."ministry"("id")
    ON DELETE set null
    ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'volunteer_notification_event_id_event_id_fk'
  ) THEN
    ALTER TABLE "volunteer_notification"
    ADD CONSTRAINT "volunteer_notification_event_id_event_id_fk"
    FOREIGN KEY ("event_id")
    REFERENCES "public"."event"("id")
    ON DELETE set null
    ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'volunteer_notification_assignment_id_assignment_id_fk'
  ) THEN
    ALTER TABLE "volunteer_notification"
    ADD CONSTRAINT "volunteer_notification_assignment_id_assignment_id_fk"
    FOREIGN KEY ("assignment_id")
    REFERENCES "public"."assignment"("id")
    ON DELETE set null
    ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "availability_church_volunteer_event_idx"
ON "availability" USING btree ("church_id", "volunteer_id", "event_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "volunteer_notification_inbox_idx"
ON "volunteer_notification" USING btree ("church_id", "volunteer_id", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "volunteer_notification_unread_idx"
ON "volunteer_notification" USING btree ("church_id", "volunteer_id", "read_at");

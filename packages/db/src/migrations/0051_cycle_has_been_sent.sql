ALTER TABLE "cycle" ADD COLUMN "has_been_sent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Only `sent` proves a Send: `past` also covers drafts that expired unsent.
UPDATE "cycle" SET "has_been_sent" = true WHERE "state" = 'sent';

CREATE TABLE "runtime_configuration" (
	"code" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outbox_message" ADD COLUMN "email_delivery_mode" jsonb;--> statement-breakpoint
ALTER TABLE "outbox_message" ADD COLUMN "email_confirmed_destinations" jsonb DEFAULT '[]'::jsonb NOT NULL;
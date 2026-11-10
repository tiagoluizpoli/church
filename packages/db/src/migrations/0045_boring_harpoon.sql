CREATE TABLE "swap_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"reply" text,
	"raised_by" text NOT NULL,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" text,
	"closed_at" timestamp with time zone,
	CONSTRAINT "swap_request_status_check" CHECK ("swap_request"."status" IN ('open', 'covered', 'kept', 'withdrawn', 'expired'))
);
--> statement-breakpoint
ALTER TABLE "swap_request" ADD CONSTRAINT "swap_request_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_request" ADD CONSTRAINT "swap_request_assignment_id_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_request" ADD CONSTRAINT "swap_request_raised_by_user_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_request" ADD CONSTRAINT "swap_request_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "swap_request_open_assignment_idx" ON "swap_request" USING btree ("assignment_id") WHERE "swap_request"."status" = 'open';--> statement-breakpoint
CREATE INDEX "swap_request_assignment_idx" ON "swap_request" USING btree ("assignment_id");
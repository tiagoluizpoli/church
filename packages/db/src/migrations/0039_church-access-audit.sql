ALTER TYPE "public"."identity_audit_action" ADD VALUE 'church_access_changed';--> statement-breakpoint
ALTER TABLE "identity_audit" ADD COLUMN "subject_id" text;--> statement-breakpoint
ALTER TABLE "identity_audit" ADD COLUMN "details" jsonb;--> statement-breakpoint
ALTER TABLE "identity_audit" ADD CONSTRAINT "identity_audit_subject_id_user_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
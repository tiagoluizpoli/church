-- Codes live 10 minutes and were keyed by the Ministry half; recipients request a new one.
DELETE FROM "invitation_verification_code";--> statement-breakpoint
ALTER TABLE "invitation_verification_code" DROP CONSTRAINT "invitation_verification_code_ministry_invitation_id_unique";--> statement-breakpoint
ALTER TABLE "invitation_verification_code" DROP CONSTRAINT "invitation_verification_code_ministry_invitation_id_ministry_invitation_id_fk";
--> statement-breakpoint
ALTER TABLE "invitation_verification_code" ADD COLUMN "church_invitation_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation_verification_code" ADD CONSTRAINT "invitation_verification_code_church_invitation_id_invitation_id_fk" FOREIGN KEY ("church_invitation_id") REFERENCES "public"."invitation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_verification_code" DROP COLUMN "ministry_invitation_id";--> statement-breakpoint
ALTER TABLE "invitation_verification_code" ADD CONSTRAINT "invitation_verification_code_church_invitation_id_unique" UNIQUE("church_invitation_id");
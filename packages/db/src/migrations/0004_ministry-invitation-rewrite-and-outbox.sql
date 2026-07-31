CREATE TYPE "public"."ministry_invitation_status" AS ENUM('pending', 'accepted', 'rejected', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."outbox_message_kind" AS ENUM('invitation.chained', 'invitation.ministry', 'invitation.church-bootstrap', 'transfer.ministry-digest', 'transfer.leaderless-ministry');--> statement-breakpoint
CREATE TYPE "public"."outbox_message_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "ministry_invitation_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"ministry_invitation_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"kind" "outbox_message_kind" NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_message_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"last_error" text,
	"provider_message_id" text,
	"correlation_id" text NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ministry_invitation" DROP CONSTRAINT "ministry_invitation_token_unique";--> statement-breakpoint
ALTER TABLE "ministry_invitation" DROP CONSTRAINT "ministry_invitation_team_id_team_id_fk";
--> statement-breakpoint
ALTER TABLE "ministry_invitation" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."ministry_invitation_status";--> statement-breakpoint
ALTER TABLE "ministry_invitation" ALTER COLUMN "status" SET DATA TYPE "public"."ministry_invitation_status" USING "status"::"public"."ministry_invitation_status";--> statement-breakpoint
ALTER TABLE "ministry_invitation" ADD COLUMN "invitee_user_id" text;--> statement-breakpoint
ALTER TABLE "ministry_invitation" ADD COLUMN "church_invitation_id" text;--> statement-breakpoint
ALTER TABLE "ministry_invitation" ADD COLUMN "ministry_access_level" "ministry_access_level" NOT NULL;--> statement-breakpoint
ALTER TABLE "ministry_invitation" ADD COLUMN "inviter_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "ministry_invitation" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ministry_invitation" ADD COLUMN "canceled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ministry_invitation" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ministry_invitation" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ministry_invitation_role" ADD CONSTRAINT "ministry_invitation_role_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_invitation_role" ADD CONSTRAINT "ministry_invitation_role_ministry_invitation_id_ministry_invitation_id_fk" FOREIGN KEY ("ministry_invitation_id") REFERENCES "public"."ministry_invitation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_invitation_role" ADD CONSTRAINT "ministry_invitation_role_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_message" ADD CONSTRAINT "outbox_message_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ministry_invitation_role_invitation_role_idx" ON "ministry_invitation_role" USING btree ("ministry_invitation_id","role_id");--> statement-breakpoint
ALTER TABLE "ministry_invitation" ADD CONSTRAINT "ministry_invitation_invitee_user_id_user_id_fk" FOREIGN KEY ("invitee_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_invitation" ADD CONSTRAINT "ministry_invitation_church_invitation_id_invitation_id_fk" FOREIGN KEY ("church_invitation_id") REFERENCES "public"."invitation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ministry_invitation" ADD CONSTRAINT "ministry_invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ministry_invitation_ministry_invitee_pending_idx" ON "ministry_invitation" USING btree ("ministry_id","invitee_user_id") WHERE "ministry_invitation"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "ministry_invitation_ministry_church_invitation_pending_idx" ON "ministry_invitation" USING btree ("ministry_id","church_invitation_id") WHERE "ministry_invitation"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "ministry_invitation" DROP COLUMN "team_id";--> statement-breakpoint
ALTER TABLE "ministry_invitation" DROP COLUMN "token";--> statement-breakpoint
ALTER TABLE "ministry_invitation" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "ministry_invitation" ADD CONSTRAINT "ministry_invitation_exactly_one_addressee_check" CHECK (("ministry_invitation"."invitee_user_id" IS NOT NULL) <> ("ministry_invitation"."church_invitation_id" IS NOT NULL));
--> The Church becomes an `organization` extension row. There is no backfill:
--> the repository is pre-production and every `church` row predates the
--> `organization` row it would now have to point at, so the tenancy root is
--> dropped and reseeded. Truncating `organization`, `church` and `user`
--> cascades through every Church-scoped and identity-scoped table.
TRUNCATE TABLE "organization", "church", "user" RESTART IDENTITY CASCADE;--> statement-breakpoint
--> The organization identifier becomes a `uuid` so `church.id` — and every
--> `church_id` foreign key beneath it — can keep referencing it. Postgres will
--> not retype a column while a foreign key spans it, so the two constraints are
--> dropped and rebuilt around the change.
ALTER TABLE "invitation" DROP CONSTRAINT "invitation_organization_id_organization_id_fk";--> statement-breakpoint
ALTER TABLE "member" DROP CONSTRAINT "member_organization_id_organization_id_fk";--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "invitation" ALTER COLUMN "organization_id" SET DATA TYPE uuid USING "organization_id"::uuid;--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "organization_id" SET DATA TYPE uuid USING "organization_id"::uuid;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "active_organization_id" SET DATA TYPE uuid USING "active_organization_id"::uuid;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "church" DROP CONSTRAINT "church_slug_unique";--> statement-breakpoint
ALTER TABLE "church" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "church" ADD CONSTRAINT "church_id_organization_id_fk" FOREIGN KEY ("id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "church" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "church" DROP COLUMN "slug";--> statement-breakpoint
ALTER TABLE "church" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "church" DROP COLUMN "updated_at";

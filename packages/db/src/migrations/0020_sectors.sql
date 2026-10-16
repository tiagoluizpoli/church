-- Hand-edited (Spec 05a #494, #498): creates `sector`, backfills one
-- `Geral` Sector per Ministry with requirements or UsualSetup headcounts,
-- merges Team-split (shift, role) requirements by summing people needed, adds
-- `shift_requirement.sector_id` (NOT NULL) set to `Geral`, drops `team_id`,
-- adds the unique (shift, sector, role) index, and rewrites UsualSetup
-- headcount items to `{ sectorId, roleId, peopleNeeded }` (items sharing a
-- role summed).
CREATE TABLE "sector" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"ministry_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sector" ADD CONSTRAINT "sector_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sector" ADD CONSTRAINT "sector_ministry_id_ministry_id_fk" FOREIGN KEY ("ministry_id") REFERENCES "public"."ministry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sector_ministry_name_idx" ON "sector" USING btree ("ministry_id","name");--> statement-breakpoint
INSERT INTO "sector" ("church_id", "ministry_id", "name")
SELECT "ministry"."church_id", "ministry"."id", 'Geral'
FROM "ministry"
WHERE EXISTS (
	SELECT 1 FROM "shift_requirement"
	INNER JOIN "ministry_participation" ON "ministry_participation"."id" = "shift_requirement"."participation_id"
	WHERE "ministry_participation"."ministry_id" = "ministry"."id"
) OR EXISTS (
	SELECT 1 FROM "usual_setup"
	WHERE "usual_setup"."ministry_id" = "ministry"."id"
	AND jsonb_array_length("usual_setup"."headcounts") > 0
);--> statement-breakpoint
WITH "grouped" AS (
	SELECT "id",
		row_number() OVER (PARTITION BY "shift_id", "role_id" ORDER BY "id") AS "rank",
		count(*) OVER (PARTITION BY "shift_id", "role_id") AS "rows",
		sum("people_needed") OVER (PARTITION BY "shift_id", "role_id") AS "total"
	FROM "shift_requirement"
)
UPDATE "shift_requirement"
SET "people_needed" = "grouped"."total"
FROM "grouped"
WHERE "shift_requirement"."id" = "grouped"."id" AND "grouped"."rank" = 1 AND "grouped"."rows" > 1;--> statement-breakpoint
DELETE FROM "shift_requirement"
USING (
	SELECT "id", row_number() OVER (PARTITION BY "shift_id", "role_id" ORDER BY "id") AS "rank"
	FROM "shift_requirement"
) AS "grouped"
WHERE "shift_requirement"."id" = "grouped"."id" AND "grouped"."rank" > 1;--> statement-breakpoint
ALTER TABLE "shift_requirement" ADD COLUMN "sector_id" uuid;--> statement-breakpoint
ALTER TABLE "shift_requirement" ADD CONSTRAINT "shift_requirement_sector_id_sector_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sector"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
UPDATE "shift_requirement"
SET "sector_id" = "sector"."id"
FROM "ministry_participation", "sector"
WHERE "ministry_participation"."id" = "shift_requirement"."participation_id"
AND "sector"."ministry_id" = "ministry_participation"."ministry_id"
AND "sector"."name" = 'Geral';--> statement-breakpoint
ALTER TABLE "shift_requirement" ALTER COLUMN "sector_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "shift_requirement" DROP CONSTRAINT "shift_requirement_team_id_team_id_fk";--> statement-breakpoint
ALTER TABLE "shift_requirement" DROP COLUMN "team_id";--> statement-breakpoint
CREATE UNIQUE INDEX "shift_requirement_shift_sector_role_idx" ON "shift_requirement" USING btree ("shift_id","sector_id","role_id");--> statement-breakpoint
UPDATE "usual_setup"
SET "headcounts" = (
	SELECT jsonb_agg(jsonb_build_object('sectorId', "sector"."id", 'roleId', "merged"."role_id", 'peopleNeeded', "merged"."total") ORDER BY "merged"."first")
	FROM (
		SELECT h.item ->> 'roleId' AS "role_id", sum((h.item ->> 'peopleNeeded')::integer) AS "total", min(h.ord) AS "first"
		FROM jsonb_array_elements("usual_setup"."headcounts") WITH ORDINALITY AS h(item, ord)
		GROUP BY h.item ->> 'roleId'
	) AS "merged"
)
FROM "sector"
WHERE "sector"."ministry_id" = "usual_setup"."ministry_id"
AND "sector"."name" = 'Geral'
AND jsonb_array_length("usual_setup"."headcounts") > 0;

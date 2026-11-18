ALTER TABLE "assignment" ADD COLUMN "shift_requirement_id" uuid;--> statement-breakpoint
WITH "ranked_requirements" AS (
	SELECT "assignment"."id" AS "assignment_id",
		"shift_requirement"."id" AS "shift_requirement_id",
		row_number() OVER (
			PARTITION BY "assignment"."id"
			ORDER BY "sector"."name", "shift_requirement"."id"
		) AS "rank"
	FROM "assignment"
	INNER JOIN "shift_requirement"
		ON "shift_requirement"."shift_id" = "assignment"."shift_id"
		AND "shift_requirement"."role_id" = "assignment"."role_id"
	INNER JOIN "sector" ON "sector"."id" = "shift_requirement"."sector_id"
)
UPDATE "assignment"
SET "shift_requirement_id" = "ranked_requirements"."shift_requirement_id"
FROM "ranked_requirements"
WHERE "ranked_requirements"."assignment_id" = "assignment"."id"
	AND "ranked_requirements"."rank" = 1;--> statement-breakpoint
DELETE FROM "assignment" WHERE "shift_requirement_id" IS NULL;--> statement-breakpoint
ALTER TABLE "assignment" ALTER COLUMN "shift_requirement_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_shift_requirement_id_shift_requirement_id_fk" FOREIGN KEY ("shift_requirement_id") REFERENCES "public"."shift_requirement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignment_shift_requirement_idx" ON "assignment" USING btree ("shift_requirement_id");

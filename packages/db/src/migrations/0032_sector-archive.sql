-- Hand-edited (Spec 12 #650): refuse, naming every collision, when active
-- Sectors of one Ministry already share a name ignoring case. Resolve them by
-- renaming first; this migration never merges or renames.
DO $$
DECLARE
	collisions text;
BEGIN
	SELECT string_agg(format('ministry %s: %s', "ministry_id", "names"), '; ')
	INTO collisions
	FROM (
		SELECT "ministry_id", string_agg(format('%s (%s)', "name", "id"), ', ' ORDER BY "id") AS "names"
		FROM "sector"
		GROUP BY "ministry_id", lower("name")
		HAVING count(*) > 1
	) AS "duplicates";
	IF collisions IS NOT NULL THEN
		RAISE EXCEPTION 'Sector names collide ignoring case within a Ministry; rename all but one before migrating: %', collisions;
	END IF;
END
$$;--> statement-breakpoint
DROP INDEX "sector_ministry_name_idx";--> statement-breakpoint
ALTER TABLE "sector" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "sector_ministry_active_name_idx" ON "sector" USING btree ("ministry_id",lower("name")) WHERE "sector"."archived_at" IS NULL;

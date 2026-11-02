-- Hand-edited (Spec 12 #649): refuse, naming every collision, when active
-- Ministries of one Church already share a name ignoring case. Resolve them by
-- renaming or archiving (deleted_at); this migration never merges or renames.
DO $$
DECLARE
	collisions text;
BEGIN
	SELECT string_agg(format('church %s: %s', "church_id", "names"), '; ')
	INTO collisions
	FROM (
		SELECT "church_id", string_agg(format('%s (%s)', "name", "id"), ', ' ORDER BY "id") AS "names"
		FROM "ministry"
		WHERE "deleted_at" IS NULL
		GROUP BY "church_id", lower("name")
		HAVING count(*) > 1
	) AS "duplicates";
	IF collisions IS NOT NULL THEN
		RAISE EXCEPTION 'Active Ministry names collide ignoring case; rename or archive all but one before migrating: %', collisions;
	END IF;
END
$$;--> statement-breakpoint
CREATE UNIQUE INDEX "ministry_church_active_name_idx" ON "ministry" USING btree ("church_id",lower("name")) WHERE "ministry"."deleted_at" IS NULL;

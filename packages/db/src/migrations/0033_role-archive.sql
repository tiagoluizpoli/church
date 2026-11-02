-- Hand-edited (Spec 12 #651): refuse, naming every collision, when Roles of
-- one Ministry already share a name ignoring case. Resolve them by renaming;
-- this migration never merges or renames.
DO $$
DECLARE
	collisions text;
BEGIN
	SELECT string_agg(format('ministry %s: %s', "ministry_id", "names"), '; ')
	INTO collisions
	FROM (
		SELECT "ministry_id", string_agg(format('%s (%s)', "name", "id"), ', ' ORDER BY "id") AS "names"
		FROM "role"
		GROUP BY "ministry_id", lower("name")
		HAVING count(*) > 1
	) AS "duplicates";
	IF collisions IS NOT NULL THEN
		RAISE EXCEPTION 'Role names collide ignoring case within a Ministry; rename all but one before migrating: %', collisions;
	END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "role" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "role_ministry_active_name_idx" ON "role" USING btree ("ministry_id",lower("name")) WHERE "role"."archived_at" IS NULL;

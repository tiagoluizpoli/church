-- rollback-compatible: adds a trigger the previous application's writes already satisfy (it checks slug history before every write)
-- A Church Slug, live (organization.slug) or given up (church_slug_history),
-- belongs to one Church. A per-slug advisory lock serialises the two tables'
-- writers, and the check runs after the lock with a fresh snapshot, so two
-- transactions cannot both pass it.
CREATE FUNCTION enforce_church_slug_claim() RETURNS trigger AS $$
DECLARE
	claimed text := NEW.slug;
	owner_id uuid;
BEGIN
	IF TG_TABLE_NAME = 'organization' THEN
		owner_id := NEW.id;
	ELSE
		owner_id := NEW.church_id;
	END IF;
	PERFORM pg_advisory_xact_lock(hashtext('church_slug_claim:' || claimed));
	IF EXISTS (SELECT 1 FROM organization WHERE slug = claimed AND id <> owner_id)
		OR EXISTS (SELECT 1 FROM church_slug_history WHERE slug = claimed AND church_id <> owner_id) THEN
		RAISE EXCEPTION 'Church Slug "%" belongs to another Church', claimed
			USING ERRCODE = 'unique_violation', CONSTRAINT = 'church_slug_claim';
	END IF;
	RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "organization_slug_claim_trigger"
AFTER INSERT OR UPDATE OF "slug" ON "organization"
FOR EACH ROW WHEN (NEW.slug IS NOT NULL) EXECUTE FUNCTION enforce_church_slug_claim();
--> statement-breakpoint
CREATE TRIGGER "church_slug_history_claim_trigger"
AFTER INSERT OR UPDATE OF "slug" ON "church_slug_history"
FOR EACH ROW EXECUTE FUNCTION enforce_church_slug_claim();

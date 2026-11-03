-- Hand-edited (Spec 15 #662): refuse, naming every collision, when one Church
-- already holds several stored-pending Church Invitations for one address
-- ignoring case. Resolve them by canceling all but one (their paired Ministry
-- halves follow); this migration never cancels, merges or deletes history.
DO $$
DECLARE
	collisions text;
BEGIN
	SELECT string_agg(format('church %s: %s', "organization_id", "ids"), '; ')
	INTO collisions
	FROM (
		SELECT "organization_id", string_agg("id", ', ' ORDER BY "id") AS "ids"
		FROM "invitation"
		WHERE "status" = 'pending'
		GROUP BY "organization_id", lower("email")
		HAVING count(*) > 1
	) AS "duplicates";
	IF collisions IS NOT NULL THEN
		RAISE EXCEPTION 'Pending Church Invitations share an address ignoring case; cancel all but one before migrating: %', collisions;
	END IF;
END
$$;--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_organization_email_pending_idx" ON "invitation" USING btree ("organization_id",lower("email")) WHERE "invitation"."status" = 'pending';

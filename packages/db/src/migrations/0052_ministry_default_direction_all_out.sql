-- Current Ministries run on Usual setup alone: normalize every all_in default to
-- all_out. The all_in code path and enum value stay (dormant). Repeat-safe, and
-- already-Sent Schedules and their staffing are not touched.
UPDATE "ministry" SET "default_direction" = 'all_out' WHERE "default_direction" = 'all_in';

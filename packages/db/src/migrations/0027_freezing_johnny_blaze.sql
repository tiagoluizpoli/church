DROP INDEX "event_template_church_name_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "event_template_church_name_idx" ON "event_template" USING btree ("church_id",lower("name"));
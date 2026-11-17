-- rollback-compatible: only adds indexes; the previous application runs unchanged without or with them
CREATE INDEX "assignment_church_volunteer_idx" ON "assignment" USING btree ("church_id","volunteer_id");--> statement-breakpoint
CREATE INDEX "ministry_membership_church_volunteer_status_idx" ON "ministry_membership" USING btree ("church_id","volunteer_id","status");--> statement-breakpoint
CREATE INDEX "event_church_cycle_idx" ON "event" USING btree ("church_id","cycle_id");--> statement-breakpoint
CREATE INDEX "event_time_block_event_idx" ON "event_time_block" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "shift_participation_block_idx" ON "shift" USING btree ("participation_id","event_time_block_id");--> statement-breakpoint
CREATE INDEX "shift_event_time_block_idx" ON "shift" USING btree ("event_time_block_id");--> statement-breakpoint
CREATE INDEX "shift_requirement_participation_idx" ON "shift_requirement" USING btree ("participation_id");
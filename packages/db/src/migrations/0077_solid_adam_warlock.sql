-- rollback-compatible: an added index changes no data or constraint the previous application sees
CREATE INDEX "outbox_message_invitation_subject_idx" ON "outbox_message" USING btree ("church_id",coalesce("payload" ->> 'ministryInvitationId', "payload" -> 'data' ->> 'ministryInvitationId', "payload" ->> 'churchInvitationId'));

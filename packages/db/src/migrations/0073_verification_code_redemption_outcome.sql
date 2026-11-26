-- rollback-compatible: adds a nullable column the previous application never reads
ALTER TABLE "invitation_verification_code" ADD COLUMN "redemption_outcome" jsonb;
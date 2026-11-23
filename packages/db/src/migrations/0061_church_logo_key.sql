-- rollback-compatible: adds a nullable column the previous application never reads
ALTER TABLE "church" ADD COLUMN "logo_key" text;
-- rollback-compatible: adds two nullable columns the previous application never reads
ALTER TABLE "church" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "church" ADD COLUMN "accent_color" text;
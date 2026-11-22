-- rollback-compatible: adds a table the previous application never reads
CREATE TABLE "church_legal_profile" (
	"church_id" uuid PRIMARY KEY NOT NULL,
	"legal_name" text NOT NULL,
	"document_type" text DEFAULT 'CNPJ' NOT NULL,
	"document_number" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	CONSTRAINT "church_legal_profile_cnpj_check" CHECK ("church_legal_profile"."document_type" = 'CNPJ' AND "church_legal_profile"."document_number" ~ '^[0-9]{14}$')
);
--> statement-breakpoint
ALTER TABLE "church_legal_profile" ADD CONSTRAINT "church_legal_profile_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "church_legal_profile_document_idx" ON "church_legal_profile" USING btree ("document_type","document_number");
-- rollback-compatible: adds a table the previous application never reads
CREATE TABLE "church_address" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"label" text,
	"street" text NOT NULL,
	"number" text NOT NULL,
	"complement" text,
	"bairro" text NOT NULL,
	"city" text NOT NULL,
	"uf" text NOT NULL,
	"cep" text,
	"country" text DEFAULT 'BR' NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"pin_source" text,
	"place_id" text,
	CONSTRAINT "church_address_country_check" CHECK ("church_address"."country" = 'BR'),
	CONSTRAINT "church_address_cep_check" CHECK ("church_address"."cep" ~ '^[0-9]{8}$'),
	CONSTRAINT "church_address_pin_check" CHECK (("church_address"."latitude" IS NULL) = ("church_address"."longitude" IS NULL) AND ("church_address"."latitude" IS NULL) = ("church_address"."pin_source" IS NULL) AND "church_address"."pin_source" IN ('google', 'cep', 'admin'))
);
--> statement-breakpoint
ALTER TABLE "church_address" ADD CONSTRAINT "church_address_church_id_church_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."church"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "church_address_church_position_idx" ON "church_address" USING btree ("church_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "church_address_main_idx" ON "church_address" USING btree ("church_id") WHERE "church_address"."is_main";
--> statement-breakpoint
-- Hand-written: a Church with addresses always has exactly one Main Address.
-- The partial unique index above allows at most one; this deferred trigger
-- refuses a transaction that leaves addresses but no main.
CREATE FUNCTION enforce_church_address_has_main() RETURNS trigger AS $$
DECLARE
	target_church uuid := COALESCE(NEW."church_id", OLD."church_id");
BEGIN
	IF EXISTS (SELECT 1 FROM "church_address" WHERE "church_id" = target_church)
		AND NOT EXISTS (SELECT 1 FROM "church_address" WHERE "church_id" = target_church AND "is_main") THEN
		RAISE EXCEPTION 'church % has addresses but no main address', target_church;
	END IF;
	RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "church_address_main_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "church_address"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION enforce_church_address_has_main();

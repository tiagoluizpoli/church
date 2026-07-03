ALTER TABLE "assignment_audit" RENAME COLUMN "leader_id" TO "actor_id";--> statement-breakpoint
ALTER TABLE "assignment_audit" ADD CONSTRAINT "assignment_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "target" ADD COLUMN "framework_mapping_id" uuid;--> statement-breakpoint
ALTER TABLE "target" ADD COLUMN "assigned_to_id" uuid;--> statement-breakpoint
ALTER TABLE "target" ADD CONSTRAINT "target_framework_mapping_id_ifm_id_fk" FOREIGN KEY ("framework_mapping_id") REFERENCES "public"."indicator_framework_mapping"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target" ADD CONSTRAINT "target_assigned_to_id_org_unit_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."org_unit"("id") ON DELETE no action ON UPDATE no action;

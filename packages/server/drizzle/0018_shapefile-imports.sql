CREATE TABLE "shapefile_import" (
	"id" uuid PRIMARY KEY NOT NULL,
	"program_id" uuid NOT NULL,
	"org_unit_level" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_ref" text NOT NULL,
	"raw_features" jsonb NOT NULL,
	"status" text NOT NULL,
	"error_log" jsonb,
	"nodes_created" integer,
	"nodes_updated" integer,
	"imported_by" uuid,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shapefile_import" ADD CONSTRAINT "shapefile_import_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shapefile_import_program" ON "shapefile_import" USING btree ("program_id");

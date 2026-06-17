CREATE TABLE "evidence_requirement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"data_element_id" uuid NOT NULL,
	"evidence_type" text NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"max_count" integer,
	"max_file_kb" integer,
	"allowed_formats" jsonb,
	"instructions" text
);
--> statement-breakpoint
CREATE TABLE "media_file" (
	"id" uuid PRIMARY KEY NOT NULL,
	"program_id" uuid NOT NULL,
	"data_element_id" uuid NOT NULL,
	"submission_id" uuid,
	"data_value_id" uuid,
	"evidence_type" text NOT NULL,
	"file_ref" text,
	"file_name" text,
	"file_size_kb" integer,
	"mime_type" text,
	"thumbnail_ref" text,
	"geo_lat" double precision,
	"geo_lng" double precision,
	"geo_accuracy_m" double precision,
	"device_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"uploaded_by" uuid,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"synced_at" timestamp with time zone,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence_requirement" ADD CONSTRAINT "evidence_requirement_data_element_id_data_element_id_fk" FOREIGN KEY ("data_element_id") REFERENCES "public"."data_element"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_file" ADD CONSTRAINT "media_file_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_file" ADD CONSTRAINT "media_file_data_element_id_data_element_id_fk" FOREIGN KEY ("data_element_id") REFERENCES "public"."data_element"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_requirement_data_element" ON "evidence_requirement" USING btree ("data_element_id");--> statement-breakpoint
CREATE INDEX "media_file_data_element" ON "media_file" USING btree ("data_element_id");--> statement-breakpoint
CREATE INDEX "media_file_submission" ON "media_file" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "media_file_data_value" ON "media_file" USING btree ("data_value_id");--> statement-breakpoint
CREATE TRIGGER log_evidence_requirement AFTER INSERT OR UPDATE OR DELETE ON "evidence_requirement"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('evidenceRequirements');--> statement-breakpoint
CREATE TRIGGER log_media_file AFTER INSERT OR UPDATE OR DELETE ON "media_file"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('mediaFiles');

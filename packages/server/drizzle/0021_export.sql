CREATE TABLE "export_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"program_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"framework_id" uuid,
	"output_format" text NOT NULL,
	"template_type" text NOT NULL,
	"donor_file_ref" text,
	"column_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"aggregation_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"period_type" text NOT NULL,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_template_mapping" (
	"id" uuid PRIMARY KEY NOT NULL,
	"template_id" uuid NOT NULL,
	"dodo_field" text NOT NULL,
	"donor_label" text,
	"donor_cell_ref" text,
	"transform" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_job" (
	"id" uuid PRIMARY KEY NOT NULL,
	"template_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"requested_by" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"location_scope" uuid,
	"framework_scope" uuid,
	"file_ref" text,
	"error_log" jsonb,
	"row_count" integer,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scheduled_export" (
	"id" uuid PRIMARY KEY NOT NULL,
	"template_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"frequency" text NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"delivery_method" text NOT NULL,
	"delivery_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "export_template" ADD CONSTRAINT "export_template_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_template" ADD CONSTRAINT "export_template_framework_id_framework_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."framework"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_template_mapping" ADD CONSTRAINT "etm_template_id_export_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."export_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_job" ADD CONSTRAINT "export_job_template_id_export_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."export_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_job" ADD CONSTRAINT "export_job_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_export" ADD CONSTRAINT "scheduled_export_template_id_export_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."export_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_export" ADD CONSTRAINT "scheduled_export_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "export_template_program" ON "export_template" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "etm_template" ON "export_template_mapping" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "export_job_template" ON "export_job" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "scheduled_export_next_run" ON "scheduled_export" USING btree ("next_run_at");

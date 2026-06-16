ALTER TABLE "program" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "program" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "program" ADD COLUMN "fiscal_year_start" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "program" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "program" ADD COLUMN "end_date" date;--> statement-breakpoint
ALTER TABLE "program" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "program" ADD CONSTRAINT "program_status_check" CHECK ("status" IN ('draft','active','closed','suspended'));--> statement-breakpoint
CREATE TABLE "program_field_def" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"program_id" uuid NOT NULL,
	"field_name" text NOT NULL,
	"field_type" text NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"options" jsonb,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_field_value" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"program_id" uuid NOT NULL,
	"field_def_id" uuid NOT NULL,
	"value" text
);
--> statement-breakpoint
ALTER TABLE "program_field_def" ADD CONSTRAINT "program_field_def_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_field_value" ADD CONSTRAINT "program_field_value_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_field_value" ADD CONSTRAINT "program_field_value_field_def_id_program_field_def_id_fk" FOREIGN KEY ("field_def_id") REFERENCES "public"."program_field_def"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "program_field_def_program" ON "program_field_def" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "program_field_value_program" ON "program_field_value" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "program_field_value_def" ON "program_field_value" USING btree ("field_def_id");--> statement-breakpoint
CREATE TRIGGER log_program_field_def AFTER INSERT OR UPDATE OR DELETE ON "program_field_def"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('programFieldDefs');--> statement-breakpoint
CREATE TRIGGER log_program_field_value AFTER INSERT OR UPDATE OR DELETE ON "program_field_value"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('programFieldValues');

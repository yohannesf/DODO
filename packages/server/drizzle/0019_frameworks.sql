CREATE TABLE "framework" (
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
	"is_internal" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "framework_level" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"framework_id" uuid NOT NULL,
	"name" text NOT NULL,
	"level_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "framework_node" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"framework_id" uuid NOT NULL,
	"level_id" uuid NOT NULL,
	"parent_id" uuid,
	"title" text NOT NULL,
	"code" text,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"budget_code" text
);
--> statement-breakpoint
CREATE TABLE "indicator_framework_mapping" (
	"id" uuid PRIMARY KEY NOT NULL,
	"indicator_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "framework_disagg_filter" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mapping_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"allowed_option_ids" uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "framework" ADD CONSTRAINT "framework_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framework_level" ADD CONSTRAINT "framework_level_framework_id_framework_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."framework"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framework_node" ADD CONSTRAINT "framework_node_framework_id_framework_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."framework"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framework_node" ADD CONSTRAINT "framework_node_level_id_framework_level_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."framework_level"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framework_node" ADD CONSTRAINT "framework_node_parent_id_framework_node_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."framework_node"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_framework_mapping" ADD CONSTRAINT "ifm_indicator_id_indicator_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_framework_mapping" ADD CONSTRAINT "ifm_node_id_framework_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."framework_node"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framework_disagg_filter" ADD CONSTRAINT "fdf_mapping_id_ifm_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."indicator_framework_mapping"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "framework_disagg_filter" ADD CONSTRAINT "fdf_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "framework_program" ON "framework" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "framework_level_framework" ON "framework_level" USING btree ("framework_id");--> statement-breakpoint
CREATE INDEX "framework_node_framework" ON "framework_node" USING btree ("framework_id");--> statement-breakpoint
CREATE INDEX "framework_node_parent" ON "framework_node" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ifm_indicator_node" ON "indicator_framework_mapping" USING btree ("indicator_id","node_id");--> statement-breakpoint
CREATE INDEX "fdf_mapping" ON "framework_disagg_filter" USING btree ("mapping_id");--> statement-breakpoint
CREATE TRIGGER log_framework AFTER INSERT OR UPDATE OR DELETE ON "framework"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('frameworks');--> statement-breakpoint
CREATE TRIGGER log_framework_level AFTER INSERT OR UPDATE OR DELETE ON "framework_level"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('frameworkLevels');--> statement-breakpoint
CREATE TRIGGER log_framework_node AFTER INSERT OR UPDATE OR DELETE ON "framework_node"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('frameworkNodes');--> statement-breakpoint
CREATE TRIGGER log_ifm AFTER INSERT OR UPDATE OR DELETE ON "indicator_framework_mapping"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('indicatorMappings');--> statement-breakpoint
CREATE TRIGGER log_fdf AFTER INSERT OR UPDATE OR DELETE ON "framework_disagg_filter"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('frameworkDisaggFilters');

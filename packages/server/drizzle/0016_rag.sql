CREATE TABLE "rag_config" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"program_id" uuid NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" uuid NOT NULL,
	"green_threshold" double precision DEFAULT 80 NOT NULL,
	"yellow_threshold" double precision DEFAULT 50 NOT NULL,
	"calc_basis" text DEFAULT 'pct_of_target' NOT NULL,
	"formula" text,
	"applies_from" date,
	"applies_to" date
);
--> statement-breakpoint
CREATE TABLE "rag_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"indicator_id" uuid NOT NULL,
	"target_id" uuid,
	"data_value_id" uuid,
	"scope_id" uuid,
	"period" text NOT NULL,
	"achieved" double precision,
	"target_val" double precision,
	"pct" double precision,
	"status" text NOT NULL,
	"config_id" uuid,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rag_config" ADD CONSTRAINT "rag_config_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_log" ADD CONSTRAINT "rag_log_indicator_id_indicator_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rag_log" ADD CONSTRAINT "rag_log_config_id_rag_config_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."rag_config"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rag_config_program" ON "rag_config" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "rag_config_scope" ON "rag_config" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "rag_log_indicator" ON "rag_log" USING btree ("indicator_id");--> statement-breakpoint
CREATE INDEX "rag_log_indicator_period" ON "rag_log" USING btree ("indicator_id","period");--> statement-breakpoint
CREATE TRIGGER log_rag_config AFTER INSERT OR UPDATE OR DELETE ON "rag_config"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('ragConfigs');

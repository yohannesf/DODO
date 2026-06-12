CREATE TYPE "public"."indicator_type" AS ENUM('number', 'percent', 'rate', 'per_thousand', 'per_ten_thousand');--> statement-breakpoint
CREATE TYPE "public"."rf_node_kind" AS ENUM('goal', 'outcome', 'output', 'activity');--> statement-breakpoint
CREATE TYPE "public"."target_kind" AS ENUM('baseline', 'target');--> statement-breakpoint
CREATE TABLE "indicator" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"numerator_expr" text NOT NULL,
	"denominator_expr" text DEFAULT '1' NOT NULL,
	"factor" double precision DEFAULT 1 NOT NULL,
	"decimals" integer DEFAULT 1 NOT NULL,
	"indicator_type" "indicator_type" DEFAULT 'number' NOT NULL,
	"annualized" boolean DEFAULT false NOT NULL,
	"program_id" uuid
);
--> statement-breakpoint
CREATE TABLE "results_framework" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"program_id" uuid
);
--> statement-breakpoint
CREATE TABLE "rf_node" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"framework_id" uuid NOT NULL,
	"parent_id" uuid,
	"kind" "rf_node_kind" NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rf_node_indicators" (
	"node_id" uuid NOT NULL,
	"indicator_id" uuid NOT NULL,
	CONSTRAINT "rf_node_indicators_node_id_indicator_id_pk" PRIMARY KEY("node_id","indicator_id")
);
--> statement-breakpoint
CREATE TABLE "target" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"indicator_id" uuid NOT NULL,
	"org_unit_id" uuid NOT NULL,
	"period" text NOT NULL,
	"value" double precision NOT NULL,
	"kind" "target_kind" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "indicator" ADD CONSTRAINT "indicator_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results_framework" ADD CONSTRAINT "results_framework_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rf_node" ADD CONSTRAINT "rf_node_framework_id_results_framework_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."results_framework"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rf_node_indicators" ADD CONSTRAINT "rf_node_indicators_node_id_rf_node_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."rf_node"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rf_node_indicators" ADD CONSTRAINT "rf_node_indicators_indicator_id_indicator_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target" ADD CONSTRAINT "target_indicator_id_indicator_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target" ADD CONSTRAINT "target_org_unit_id_org_unit_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "indicator_code_live" ON "indicator" USING btree ("code") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "results_framework_code_live" ON "results_framework" USING btree ("code") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "rf_node_framework" ON "rf_node" USING btree ("framework_id");--> statement-breakpoint
CREATE UNIQUE INDEX "target_key_live" ON "target" USING btree ("indicator_id","org_unit_id","period","kind") WHERE deleted_at is null;
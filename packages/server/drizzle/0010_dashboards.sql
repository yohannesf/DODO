CREATE TYPE "public"."widget_kind" AS ENUM('kpi', 'chart', 'map', 'table', 'text');--> statement-breakpoint
CREATE TABLE "dashboard" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"shared" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dashboard_id" uuid NOT NULL,
	"kind" "widget_kind" NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"grid_x" integer DEFAULT 0 NOT NULL,
	"grid_y" integer DEFAULT 0 NOT NULL,
	"grid_w" integer DEFAULT 4 NOT NULL,
	"grid_h" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dashboard_item" ADD CONSTRAINT "dashboard_item_dashboard_id_dashboard_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboard"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_code_live" ON "dashboard" USING btree ("code") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "dashboard_item_dashboard" ON "dashboard_item" USING btree ("dashboard_id");
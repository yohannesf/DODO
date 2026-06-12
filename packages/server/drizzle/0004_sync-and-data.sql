CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'sync_conflict');--> statement-breakpoint
CREATE TYPE "public"."change_op" AS ENUM('upsert', 'delete');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('draft', 'completed', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "data_value" (
	"id" uuid PRIMARY KEY NOT NULL,
	"data_element_id" uuid NOT NULL,
	"org_unit_id" uuid NOT NULL,
	"period" text NOT NULL,
	"category_option_combo_id" uuid NOT NULL,
	"value" text NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"submission_id" uuid,
	"stored_by" uuid,
	"client_ts" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_value_audit" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "data_value_audit_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"data_value_id" uuid NOT NULL,
	"old_value" text,
	"new_value" text,
	"actor" uuid,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"action" "audit_action" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "submission" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dataset_id" uuid NOT NULL,
	"org_unit_id" uuid NOT NULL,
	"period" text NOT NULL,
	"status" "submission_status" DEFAULT 'draft' NOT NULL,
	"completed_by" uuid,
	"completed_at" timestamp with time zone,
	"note" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_change_log" (
	"server_seq" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sync_change_log_server_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"collection" text NOT NULL,
	"row_id" uuid NOT NULL,
	"op" "change_op" NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_device" (
	"device_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_push_at" timestamp with time zone,
	"last_pull_cursor" integer
);
--> statement-breakpoint
CREATE TABLE "sync_op" (
	"op_id" uuid PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_push_journal" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sync_push_journal_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"device_id" uuid NOT NULL,
	"batch_hash" text NOT NULL,
	"op_count" integer NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_value" ADD CONSTRAINT "data_value_data_element_id_data_element_id_fk" FOREIGN KEY ("data_element_id") REFERENCES "public"."data_element"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_value" ADD CONSTRAINT "data_value_org_unit_id_org_unit_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_dataset_id_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."dataset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_org_unit_id_org_unit_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "data_value_cell" ON "data_value" USING btree ("data_element_id","org_unit_id","period","category_option_combo_id");--> statement-breakpoint
CREATE INDEX "data_value_org_unit" ON "data_value" USING btree ("org_unit_id","period");--> statement-breakpoint
CREATE INDEX "data_value_audit_value" ON "data_value_audit" USING btree ("data_value_id");--> statement-breakpoint
CREATE INDEX "session_user" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_key" ON "submission" USING btree ("dataset_id","org_unit_id","period");--> statement-breakpoint
CREATE INDEX "sync_change_log_collection" ON "sync_change_log" USING btree ("collection","server_seq");
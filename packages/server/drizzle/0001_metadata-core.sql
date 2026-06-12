CREATE TYPE "public"."aggregation_op" AS ENUM('sum', 'avg', 'count', 'min', 'max', 'last');--> statement-breakpoint
CREATE TYPE "public"."frequency" AS ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');--> statement-breakpoint
CREATE TYPE "public"."org_unit_scope" AS ENUM('data_entry', 'data_view');--> statement-breakpoint
CREATE TYPE "public"."value_type" AS ENUM('INTEGER', 'INTEGER_POSITIVE', 'INTEGER_ZERO_OR_POSITIVE', 'NUMBER', 'PERCENTAGE', 'BOOLEAN', 'TEXT', 'LONG_TEXT', 'DATE', 'OPTION', 'COORDINATE', 'FILE');--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"data_dimension" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_combo" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"code" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_combo_categories" (
	"combo_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "category_combo_categories_combo_id_category_id_pk" PRIMARY KEY("combo_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "category_option" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_option_combo" (
	"id" uuid PRIMARY KEY NOT NULL,
	"combo_id" uuid NOT NULL,
	"name" text NOT NULL,
	"option_ids" uuid[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_element" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"code" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"value_type" "value_type" NOT NULL,
	"category_combo_id" uuid,
	"unit_of_measure" text DEFAULT '' NOT NULL,
	"aggregation_op" "aggregation_op" DEFAULT 'sum' NOT NULL,
	"option_set_id" uuid
);
--> statement-breakpoint
CREATE TABLE "dataset" (
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
	"frequency" "frequency" NOT NULL,
	"open_future_periods" integer DEFAULT 0 NOT NULL,
	"expiry_days" integer DEFAULT 0 NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"program_id" uuid,
	"entry_layout" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dataset_elements" (
	"dataset_id" uuid NOT NULL,
	"data_element_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"section" text DEFAULT '' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	CONSTRAINT "dataset_elements_dataset_id_data_element_id_pk" PRIMARY KEY("dataset_id","data_element_id")
);
--> statement-breakpoint
CREATE TABLE "dataset_org_units" (
	"dataset_id" uuid NOT NULL,
	"org_unit_id" uuid NOT NULL,
	CONSTRAINT "dataset_org_units_dataset_id_org_unit_id_pk" PRIMARY KEY("dataset_id","org_unit_id")
);
--> statement-breakpoint
CREATE TABLE "option" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"option_set_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "option_set" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"code" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_unit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"parent_id" uuid,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"code" text NOT NULL,
	"level" integer NOT NULL,
	"path" "ltree" NOT NULL,
	"opening_date" date,
	"closed_date" date,
	"geometry" geometry(Geometry,4326),
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_unit_level" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"level" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program" (
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
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"permissions" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"username" text NOT NULL,
	"email" text,
	"password_hash" text,
	"display_name" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_org_units" (
	"user_id" uuid NOT NULL,
	"org_unit_id" uuid NOT NULL,
	"scope" "org_unit_scope" NOT NULL,
	CONSTRAINT "user_org_units_user_id_org_unit_id_scope_pk" PRIMARY KEY("user_id","org_unit_id","scope")
);
--> statement-breakpoint
CREATE TABLE "user_role" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "user_role_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "category_combo_categories" ADD CONSTRAINT "category_combo_categories_combo_id_category_combo_id_fk" FOREIGN KEY ("combo_id") REFERENCES "public"."category_combo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_combo_categories" ADD CONSTRAINT "category_combo_categories_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_option" ADD CONSTRAINT "category_option_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_option_combo" ADD CONSTRAINT "category_option_combo_combo_id_category_combo_id_fk" FOREIGN KEY ("combo_id") REFERENCES "public"."category_combo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_element" ADD CONSTRAINT "data_element_category_combo_id_category_combo_id_fk" FOREIGN KEY ("category_combo_id") REFERENCES "public"."category_combo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_element" ADD CONSTRAINT "data_element_option_set_id_option_set_id_fk" FOREIGN KEY ("option_set_id") REFERENCES "public"."option_set"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_elements" ADD CONSTRAINT "dataset_elements_dataset_id_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."dataset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_elements" ADD CONSTRAINT "dataset_elements_data_element_id_data_element_id_fk" FOREIGN KEY ("data_element_id") REFERENCES "public"."data_element"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_org_units" ADD CONSTRAINT "dataset_org_units_dataset_id_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."dataset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_org_units" ADD CONSTRAINT "dataset_org_units_org_unit_id_org_unit_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option" ADD CONSTRAINT "option_option_set_id_option_set_id_fk" FOREIGN KEY ("option_set_id") REFERENCES "public"."option_set"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_org_units" ADD CONSTRAINT "user_org_units_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_org_units" ADD CONSTRAINT "user_org_units_org_unit_id_org_unit_id_fk" FOREIGN KEY ("org_unit_id") REFERENCES "public"."org_unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_code_live" ON "category" USING btree ("code") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "category_combo_code_live" ON "category_combo" USING btree ("code") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "category_option_code_live" ON "category_option" USING btree ("code") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "category_option_category" ON "category_option" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "coc_combo" ON "category_option_combo" USING btree ("combo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "data_element_code_live" ON "data_element" USING btree ("code") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_code_live" ON "dataset" USING btree ("code") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "option_set_idx" ON "option" USING btree ("option_set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "option_code_live" ON "option" USING btree ("option_set_id","code") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "option_set_code_live" ON "option_set" USING btree ("code") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "org_unit_code_live" ON "org_unit" USING btree ("code") WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "org_unit_parent" ON "org_unit" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "org_unit_path_gist" ON "org_unit" USING gist ("path");--> statement-breakpoint
CREATE INDEX "org_unit_geometry_gist" ON "org_unit" USING gist ("geometry");--> statement-breakpoint
CREATE UNIQUE INDEX "org_unit_level_live" ON "org_unit_level" USING btree ("level") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "program_code_live" ON "program" USING btree ("code") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "role_code_live" ON "role" USING btree ("code") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "user_username_live" ON "user" USING btree ("username") WHERE deleted_at is null;
CREATE TYPE "public"."severity" AS ENUM('warning', 'error');--> statement-breakpoint
CREATE TYPE "public"."validation_op" AS ENUM('<', '<=', '=', '!=', '>=', '>');--> statement-breakpoint
CREATE TABLE "validation_rule" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"left_expr" text NOT NULL,
	"op" "validation_op" NOT NULL,
	"right_expr" text NOT NULL,
	"severity" "severity" DEFAULT 'warning' NOT NULL,
	"instruction" text DEFAULT '' NOT NULL,
	"datasets" uuid[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "validation_rule_code_live" ON "validation_rule" USING btree ("code") WHERE deleted_at is null;
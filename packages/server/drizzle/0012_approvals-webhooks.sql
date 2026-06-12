CREATE TYPE "public"."approval_status" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TABLE "approval" (
	"id" uuid PRIMARY KEY NOT NULL,
	"submission_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"actor" uuid NOT NULL,
	"status" "approval_status" NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"events" text[] DEFAULT '{}' NOT NULL,
	"secret" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_status" integer,
	"last_fired_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "dataset" ADD COLUMN "approval_levels" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_submission" ON "approval" USING btree ("submission_id");
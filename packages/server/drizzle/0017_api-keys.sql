CREATE TABLE "api_key" (
	"id" uuid PRIMARY KEY NOT NULL,
	"program_id" uuid,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"access_level" text NOT NULL,
	"allowed_endpoints" jsonb,
	"rate_limit_rph" integer,
	"webhook_url" text,
	"webhook_events" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" uuid,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_program_id_program_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."program"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_key_hash" ON "api_key" USING btree ("key_hash");

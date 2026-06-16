ALTER TABLE "category_option" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "category_option" ADD CONSTRAINT "category_option_parent_id_category_option_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."category_option"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_option_parent" ON "category_option" USING btree ("parent_id");

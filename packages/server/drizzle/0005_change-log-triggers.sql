-- Change-capture triggers (spec §4.2 / §6): every write to a synced table
-- appends to sync_change_log; server_seq is the global sync cursor.
CREATE OR REPLACE FUNCTION dodo_log_change() RETURNS trigger AS $$
DECLARE
  v_collection text := TG_ARGV[0];
  v_row_id uuid;
  v_op change_op;
  v_deleted timestamptz;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row_id := OLD.id;
    v_op := 'delete';
  ELSE
    v_row_id := NEW.id;
    -- soft delete (deleted_at set) becomes a tombstone for sync
    BEGIN
      v_deleted := to_jsonb(NEW) ->> 'deleted_at';
    EXCEPTION WHEN others THEN
      v_deleted := NULL;
    END;
    IF v_deleted IS NOT NULL THEN
      v_op := 'delete';
    ELSE
      v_op := 'upsert';
    END IF;
  END IF;
  INSERT INTO sync_change_log (collection, row_id, op)
  VALUES (v_collection, v_row_id, v_op);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER log_program AFTER INSERT OR UPDATE OR DELETE ON "program"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('programs');
--> statement-breakpoint
CREATE TRIGGER log_org_unit_level AFTER INSERT OR UPDATE OR DELETE ON "org_unit_level"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('orgUnitLevels');
--> statement-breakpoint
CREATE TRIGGER log_org_unit AFTER INSERT OR UPDATE OR DELETE ON "org_unit"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('orgUnits');
--> statement-breakpoint
CREATE TRIGGER log_category AFTER INSERT OR UPDATE OR DELETE ON "category"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('categories');
--> statement-breakpoint
CREATE TRIGGER log_category_option AFTER INSERT OR UPDATE OR DELETE ON "category_option"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('categoryOptions');
--> statement-breakpoint
CREATE TRIGGER log_category_combo AFTER INSERT OR UPDATE OR DELETE ON "category_combo"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('categoryCombos');
--> statement-breakpoint
CREATE TRIGGER log_category_option_combo AFTER INSERT OR UPDATE OR DELETE ON "category_option_combo"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('categoryOptionCombos');
--> statement-breakpoint
CREATE TRIGGER log_option_set AFTER INSERT OR UPDATE OR DELETE ON "option_set"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('optionSets');
--> statement-breakpoint
CREATE TRIGGER log_option AFTER INSERT OR UPDATE OR DELETE ON "option"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('options');
--> statement-breakpoint
CREATE TRIGGER log_data_element AFTER INSERT OR UPDATE OR DELETE ON "data_element"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('dataElements');
--> statement-breakpoint
CREATE TRIGGER log_dataset AFTER INSERT OR UPDATE OR DELETE ON "dataset"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('datasets');
--> statement-breakpoint
CREATE TRIGGER log_data_value AFTER INSERT OR UPDATE OR DELETE ON "data_value"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('dataValues');
--> statement-breakpoint
CREATE TRIGGER log_submission AFTER INSERT OR UPDATE OR DELETE ON "submission"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('submissions');

CREATE TRIGGER log_validation_rule AFTER INSERT OR UPDATE OR DELETE ON "validation_rule"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('validationRules');

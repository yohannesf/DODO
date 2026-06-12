CREATE TRIGGER log_indicator AFTER INSERT OR UPDATE OR DELETE ON "indicator"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('indicators');
--> statement-breakpoint
CREATE TRIGGER log_results_framework AFTER INSERT OR UPDATE OR DELETE ON "results_framework"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('resultsFrameworks');
--> statement-breakpoint
CREATE TRIGGER log_rf_node AFTER INSERT OR UPDATE OR DELETE ON "rf_node"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('rfNodes');
--> statement-breakpoint
CREATE TRIGGER log_target AFTER INSERT OR UPDATE OR DELETE ON "target"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('targets');

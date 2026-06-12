CREATE TRIGGER log_dashboard AFTER INSERT OR UPDATE OR DELETE ON "dashboard"
  FOR EACH ROW EXECUTE FUNCTION dodo_log_change('dashboards');

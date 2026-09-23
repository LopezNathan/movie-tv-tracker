-- Existing guides have unknown completeness; refresh them on the next detail visit.
ALTER TABLE media ADD COLUMN episodes_updated_at TEXT;

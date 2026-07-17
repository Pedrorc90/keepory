-- Prevent duplicate items from the same external source (soft-deleted rows excluded).
CREATE UNIQUE INDEX ux_item_type_source_external
    ON item (type, source, external_id)
    WHERE deleted_at IS NULL AND source IS NOT NULL AND external_id IS NOT NULL;

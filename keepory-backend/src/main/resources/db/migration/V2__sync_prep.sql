ALTER TABLE item
    ADD COLUMN deleted_at  TIMESTAMPTZ,
    ADD COLUMN source      VARCHAR(20),
    ADD COLUMN external_id VARCHAR(100);

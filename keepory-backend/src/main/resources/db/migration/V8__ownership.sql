ALTER TABLE item                 ADD COLUMN user_id UUID REFERENCES app_user (id) ON DELETE CASCADE;
ALTER TABLE collection           ADD COLUMN user_id UUID REFERENCES app_user (id) ON DELETE CASCADE;
ALTER TABLE suggestion_dismissal ADD COLUMN user_id UUID REFERENCES app_user (id) ON DELETE CASCADE;

-- Everything that existed before auth belongs to the owner, i.e. the first
-- account created. On a fresh database there are no rows and this does nothing.
UPDATE item                 SET user_id = (SELECT id FROM app_user ORDER BY created_at LIMIT 1);
UPDATE collection           SET user_id = (SELECT id FROM app_user ORDER BY created_at LIMIT 1);
UPDATE suggestion_dismissal SET user_id = (SELECT id FROM app_user ORDER BY created_at LIMIT 1);

ALTER TABLE item                 ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE collection           ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE suggestion_dismissal ALTER COLUMN user_id SET NOT NULL;

-- Uniqueness was global; it is now per user. Without this, the first person to
-- add a film would stop everyone else from adding it.
DROP INDEX ux_item_type_source_external;
CREATE UNIQUE INDEX ux_item_user_type_source_external
    ON item (user_id, type, source, external_id)
    WHERE deleted_at IS NULL AND source IS NOT NULL AND external_id IS NOT NULL;

-- Same for collection names: "Favoritas" is one per user and type.
DROP INDEX uq_collection_name_type;
CREATE UNIQUE INDEX uq_collection_user_name_type
    ON collection (user_id, lower(name), coalesce(type, ''));

-- A dismissal is personal: your friend hiding Dune must not hide it for you.
ALTER TABLE suggestion_dismissal DROP CONSTRAINT suggestion_dismissal_pkey;
ALTER TABLE suggestion_dismissal ADD PRIMARY KEY (user_id, source, external_id);

CREATE INDEX idx_item_user       ON item (user_id);
CREATE INDEX idx_collection_user ON collection (user_id);

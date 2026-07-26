CREATE TABLE collection (
    id         UUID PRIMARY KEY,
    name       VARCHAR(120) NOT NULL,
    -- Null means the collection accepts any item type.
    type       VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_collection_name ON collection (lower(name));

CREATE TABLE collection_item (
    collection_id UUID NOT NULL REFERENCES collection (id) ON DELETE CASCADE,
    item_id       UUID NOT NULL REFERENCES item (id) ON DELETE CASCADE,
    added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (collection_id, item_id)
);

CREATE INDEX idx_collection_item_item ON collection_item (item_id);

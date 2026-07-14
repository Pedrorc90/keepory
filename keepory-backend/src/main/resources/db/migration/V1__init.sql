CREATE TABLE item (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type         VARCHAR(20)  NOT NULL,
    title        VARCHAR(255) NOT NULL,
    cover_url    TEXT,
    status       VARCHAR(20)  NOT NULL,
    rating       INTEGER CHECK (rating BETWEEN 1 AND 5),
    completed_at DATE,
    notes        TEXT,
    attributes   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_item_type_status ON item (type, status);

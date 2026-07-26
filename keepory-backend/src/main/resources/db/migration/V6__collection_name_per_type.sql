-- The name only has to be unique within its type: "Favoritas" can exist both
-- for movies and for books. coalesce keeps the untyped ones unique among
-- themselves, which a plain unique index would not do (NULL != NULL).
DROP INDEX uq_collection_name;

CREATE UNIQUE INDEX uq_collection_name_type ON collection (lower(name), coalesce(type, ''));

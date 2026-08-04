-- A collection with no type was never reachable: the UI always creates one under
-- Películas or Libros, and an untyped one would hide in the sidebar (which paints
-- by type) while colliding by name with a typed one. Closing the door.

-- Expected to touch zero rows. If one slipped in by hand, it takes the type most
-- of its items already have; an empty one falls back to MOVIE.
UPDATE collection c
SET type = coalesce((
    SELECT i.type
    FROM collection_item ci
    JOIN item i ON i.id = ci.item_id
    WHERE ci.collection_id = c.id AND i.deleted_at IS NULL
    GROUP BY i.type
    ORDER BY count(*) DESC, i.type ASC
    LIMIT 1
), 'MOVIE')
WHERE c.type IS NULL;

ALTER TABLE collection ALTER COLUMN type SET NOT NULL;

-- coalesce is dead weight once the column cannot be null.
DROP INDEX uq_collection_user_name_type;
CREATE UNIQUE INDEX uq_collection_user_name_type ON collection (user_id, lower(name), type);

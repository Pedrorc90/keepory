package com.keepory.collection;

import com.keepory.item.ItemType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface CollectionRepository extends JpaRepository<Collection, UUID> {

    List<Collection> findAllByOrderByNameAsc();

    List<Collection> findByTypeIsNullOrTypeOrderByNameAsc(ItemType type);

    // Scoped to the type: the same name is free in each section of the sidebar.
    boolean existsByNameIgnoreCaseAndType(String name, ItemType type);

    @Query("select c.id from Collection c join c.items i where i.id = :itemId and i.deletedAt is null")
    List<UUID> findIdsByItemId(@Param("itemId") UUID itemId);

    // Quoted aliases so Postgres keeps the camel case the projection getters expect.
    @Query(value = """
            select ci.collection_id as "collectionId", count(*) as "total"
            from collection_item ci
            join item i on i.id = ci.item_id
            where i.deleted_at is null
            group by ci.collection_id
            """, nativeQuery = true)
    List<CollectionCount> countItems();

    // Up to four covers per collection, newest first: the mosaic on the collection card.
    @Query(value = """
            select "collectionId", "coverUrl" from (
              select ci.collection_id as "collectionId", i.cover_url as "coverUrl",
                     row_number() over (partition by ci.collection_id order by ci.added_at desc) as rn
              from collection_item ci
              join item i on i.id = ci.item_id
              where i.deleted_at is null and i.cover_url is not null
            ) ranked
            where rn <= 4
            """, nativeQuery = true)
    List<CollectionCover> findCovers();

    interface CollectionCount {
        UUID getCollectionId();

        long getTotal();
    }

    interface CollectionCover {
        UUID getCollectionId();

        String getCoverUrl();
    }
}

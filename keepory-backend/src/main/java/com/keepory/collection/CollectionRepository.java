package com.keepory.collection;

import com.keepory.item.ItemType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CollectionRepository extends JpaRepository<Collection, UUID> {

    Optional<Collection> findByIdAndUserId(UUID id, UUID userId);

    List<Collection> findByUserIdOrderByNameAsc(UUID userId);

    /**
     * Written out instead of derived from the method name: Spring Data reads
     * "A and B or C" as "(A and B) or C", which here would leak other people's
     * collections whenever the type matched.
     */
    @Query("""
            select c from Collection c
            where c.userId = :userId and (c.type is null or c.type = :type)
            order by c.name asc
            """)
    List<Collection> findVisibleForType(@Param("userId") UUID userId, @Param("type") ItemType type);

    // Scoped to the type: the same name is free in each section of the sidebar.
    boolean existsByNameIgnoreCaseAndTypeAndUserId(String name, ItemType type, UUID userId);

    @Query("""
            select c.id from Collection c join c.items i
            where i.id = :itemId and i.deletedAt is null and c.userId = :userId
            """)
    List<UUID> findIdsByItemId(@Param("itemId") UUID itemId, @Param("userId") UUID userId);

    // Quoted aliases so Postgres keeps the camel case the projection getters expect.
    @Query(value = """
            select ci.collection_id as "collectionId", count(*) as "total"
            from collection_item ci
            join item i on i.id = ci.item_id
            join collection c on c.id = ci.collection_id
            where i.deleted_at is null and c.user_id = cast(:userId as uuid)
            group by ci.collection_id
            """, nativeQuery = true)
    List<CollectionCount> countItems(@Param("userId") String userId);

    // Up to four covers per collection, newest first: the mosaic on the collection card.
    @Query(value = """
            select "collectionId", "coverUrl" from (
              select ci.collection_id as "collectionId", i.cover_url as "coverUrl",
                     row_number() over (partition by ci.collection_id order by ci.added_at desc) as rn
              from collection_item ci
              join item i on i.id = ci.item_id
              join collection c on c.id = ci.collection_id
              where i.deleted_at is null and i.cover_url is not null
                and c.user_id = cast(:userId as uuid)
            ) ranked
            where rn <= 4
            """, nativeQuery = true)
    List<CollectionCover> findCovers(@Param("userId") String userId);

    interface CollectionCount {
        UUID getCollectionId();

        long getTotal();
    }

    interface CollectionCover {
        UUID getCollectionId();

        String getCoverUrl();
    }
}

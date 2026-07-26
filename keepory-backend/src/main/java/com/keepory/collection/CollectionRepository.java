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

    boolean existsByNameIgnoreCase(String name);

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

    interface CollectionCount {
        UUID getCollectionId();

        long getTotal();
    }
}

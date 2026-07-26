package com.keepory.item;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ItemRepository extends JpaRepository<Item, UUID> {

    // Every finder is scoped by userId: an item of someone else must read as absent.
    Optional<Item> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    List<Item> findByTypeAndUserIdAndDeletedAtIsNull(ItemType type, UUID userId);

    List<Item> findByTypeAndSourceAndUserIdAndDeletedAtIsNull(ItemType type, String source, UUID userId);

    boolean existsByTypeAndSourceAndExternalIdAndUserIdAndDeletedAtIsNull(
            ItemType type, String source, String externalId, UUID userId);

    // Native SQL because JPQL cannot order by JSONB fields (first genre/category).
    @Query(value = """
            select * from item i
            where i.deleted_at is null
              and i.user_id = cast(:userId as uuid)
              and (cast(:type as text) is null or i.type = cast(:type as text))
              and (cast(:status as text) is null or i.status = cast(:status as text))
              and (:q = '' or i.title ilike '%' || :q || '%')
              and (cast(:collectionId as text) is null or exists (
                    select 1 from collection_item ci
                    where ci.item_id = i.id and ci.collection_id = cast(:collectionId as uuid)))
              and (cast(:excludeCollected as boolean) is not true or not exists (
                    select 1 from collection_item ci2 where ci2.item_id = i.id))
            order by
              case when :sort = 'title' then lower(i.title) end,
              case when :sort = 'genre'
                   then lower(coalesce(i.attributes->'genres'->>0, i.attributes->'categories'->>0)) end nulls last,
              i.created_at desc
            """,
            countQuery = """
            select count(*) from item i
            where i.deleted_at is null
              and i.user_id = cast(:userId as uuid)
              and (cast(:type as text) is null or i.type = cast(:type as text))
              and (cast(:status as text) is null or i.status = cast(:status as text))
              and (:q = '' or i.title ilike '%' || :q || '%')
              and (cast(:collectionId as text) is null or exists (
                    select 1 from collection_item ci
                    where ci.item_id = i.id and ci.collection_id = cast(:collectionId as uuid)))
              and (cast(:excludeCollected as boolean) is not true or not exists (
                    select 1 from collection_item ci2 where ci2.item_id = i.id))
            """,
            nativeQuery = true)
    Page<Item> search(@Param("userId") String userId,
                      @Param("type") String type,
                      @Param("status") String status,
                      @Param("q") String q,
                      @Param("sort") String sort,
                      @Param("collectionId") String collectionId,
                      @Param("excludeCollected") boolean excludeCollected,
                      Pageable pageable);
}

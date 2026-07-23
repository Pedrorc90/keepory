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

    Optional<Item> findByIdAndDeletedAtIsNull(UUID id);

    List<Item> findByTypeAndDeletedAtIsNull(ItemType type);

    List<Item> findByTypeAndSourceAndDeletedAtIsNull(ItemType type, String source);

    boolean existsByTypeAndSourceAndExternalIdAndDeletedAtIsNull(ItemType type, String source, String externalId);

    // Native SQL because JPQL cannot order by JSONB fields (first genre/category).
    @Query(value = """
            select * from item i
            where i.deleted_at is null
              and (cast(:type as text) is null or i.type = cast(:type as text))
              and (cast(:status as text) is null or i.status = cast(:status as text))
              and (:q = '' or i.title ilike '%' || :q || '%')
            order by
              case when :sort = 'title' then lower(i.title) end,
              case when :sort = 'genre'
                   then lower(coalesce(i.attributes->'genres'->>0, i.attributes->'categories'->>0)) end nulls last,
              i.created_at desc
            """,
            countQuery = """
            select count(*) from item i
            where i.deleted_at is null
              and (cast(:type as text) is null or i.type = cast(:type as text))
              and (cast(:status as text) is null or i.status = cast(:status as text))
              and (:q = '' or i.title ilike '%' || :q || '%')
            """,
            nativeQuery = true)
    Page<Item> search(@Param("type") String type,
                      @Param("status") String status,
                      @Param("q") String q,
                      @Param("sort") String sort,
                      Pageable pageable);
}

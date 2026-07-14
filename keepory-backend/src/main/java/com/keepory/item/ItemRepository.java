package com.keepory.item;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface ItemRepository extends JpaRepository<Item, UUID> {

    @Query("""
            select i from Item i
            where (:type is null or i.type = :type)
              and (:status is null or i.status = :status)
              and (:q = '' or lower(i.title) like lower(concat('%', :q, '%')))
            """)
    Page<Item> search(@Param("type") ItemType type,
                      @Param("status") ItemStatus status,
                      @Param("q") String q,
                      Pageable pageable);
}

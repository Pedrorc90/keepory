package com.keepory.item;

import com.keepory.auth.CurrentUser;
import com.keepory.item.dto.ItemRequest;
import com.keepory.item.dto.ItemResponse;
import jakarta.persistence.EntityExistsException;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.UUID;

@Service
@Transactional
public class ItemService {

    private final ItemRepository repository;
    private final CurrentUser currentUser;

    public ItemService(ItemRepository repository, CurrentUser currentUser) {
        this.repository = repository;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public Page<ItemResponse> search(ItemType type, ItemStatus status, String q, String sort, UUID collectionId,
                                     boolean excludeCollected, Pageable pageable) {
        String query = q == null ? "" : q.trim();
        String sortKey = "title".equals(sort) || "genre".equals(sort) ? sort : "recent";
        // The native query defines its own order; drop any sort carried by the Pageable.
        Pageable page = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
        return repository.search(
                currentUser.id().toString(),
                type == null ? null : type.name(),
                status == null ? null : status.name(),
                query, sortKey,
                collectionId == null ? null : collectionId.toString(),
                // Both filters together would always be empty: browsing a collection wins.
                excludeCollected && collectionId == null, page).map(ItemResponse::from);
    }

    @Transactional(readOnly = true)
    public ItemResponse get(UUID id) {
        return ItemResponse.from(find(id));
    }

    public ItemResponse create(ItemRequest request) {
        UUID userId = currentUser.id();
        UUID id = request.id() != null ? request.id() : UUID.randomUUID();
        if (repository.existsById(id)) {
            throw new EntityExistsException("Item %s already exists".formatted(id));
        }
        // Duplicate check is per user: the same film in two libraries is not a clash.
        if (request.source() != null && request.externalId() != null
                && repository.existsByTypeAndSourceAndExternalIdAndUserIdAndDeletedAtIsNull(
                        request.type(), request.source(), request.externalId(), userId)) {
            throw new EntityExistsException(
                    "Item from %s with external id %s already exists".formatted(request.source(), request.externalId()));
        }
        Item item = new Item();
        item.setId(id);
        item.setUserId(userId);
        apply(item, request);
        // Flush so Hibernate populates createdAt/updatedAt before building the response.
        return ItemResponse.from(repository.saveAndFlush(item));
    }

    public ItemResponse update(UUID id, ItemRequest request) {
        Item item = find(id);
        apply(item, request);
        // Flush so updatedAt reflects this change in the response.
        repository.flush();
        return ItemResponse.from(item);
    }

    public void delete(UUID id) {
        // Soft delete: keeps a tombstone so offline clients can sync the removal.
        find(id).setDeletedAt(OffsetDateTime.now());
    }

    private Item find(UUID id) {
        // Someone else's item is "not found", not "forbidden": a 403 would confirm it exists.
        return repository.findByIdAndUserIdAndDeletedAtIsNull(id, currentUser.id())
                .orElseThrow(() -> new EntityNotFoundException("Item %s not found".formatted(id)));
    }

    private void apply(Item item, ItemRequest request) {
        item.setType(request.type());
        item.setTitle(request.title());
        item.setCoverUrl(request.coverUrl());
        item.setStatus(request.status());
        item.setRating(request.rating());
        item.setCompletedAt(request.completedAt());
        item.setNotes(request.notes());
        item.setAttributes(request.attributes() != null ? request.attributes() : new HashMap<>());
        item.setSource(request.source());
        item.setExternalId(request.externalId());
    }
}

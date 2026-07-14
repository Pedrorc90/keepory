package com.keepory.item;

import com.keepory.item.dto.ItemRequest;
import com.keepory.item.dto.ItemResponse;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.UUID;

@Service
@Transactional
public class ItemService {

    private final ItemRepository repository;

    public ItemService(ItemRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public Page<ItemResponse> search(ItemType type, ItemStatus status, String q, Pageable pageable) {
        String query = q == null ? "" : q.trim();
        return repository.search(type, status, query, pageable).map(ItemResponse::from);
    }

    @Transactional(readOnly = true)
    public ItemResponse get(UUID id) {
        return ItemResponse.from(find(id));
    }

    public ItemResponse create(ItemRequest request) {
        Item item = new Item();
        apply(item, request);
        return ItemResponse.from(repository.save(item));
    }

    public ItemResponse update(UUID id, ItemRequest request) {
        Item item = find(id);
        apply(item, request);
        return ItemResponse.from(item);
    }

    public void delete(UUID id) {
        repository.delete(find(id));
    }

    private Item find(UUID id) {
        return repository.findById(id)
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
    }
}

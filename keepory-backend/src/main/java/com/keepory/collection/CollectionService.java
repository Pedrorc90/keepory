package com.keepory.collection;

import com.keepory.collection.dto.CollectionRequest;
import com.keepory.collection.dto.CollectionResponse;
import com.keepory.item.Item;
import com.keepory.item.ItemRepository;
import com.keepory.item.ItemType;
import jakarta.persistence.EntityExistsException;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Transactional
public class CollectionService {

    private final CollectionRepository repository;
    private final ItemRepository itemRepository;

    public CollectionService(CollectionRepository repository, ItemRepository itemRepository) {
        this.repository = repository;
        this.itemRepository = itemRepository;
    }

    @Transactional(readOnly = true)
    public List<CollectionResponse> list(ItemType type) {
        // A typed filter also returns the untyped ones: those accept any item.
        List<Collection> collections = type == null
                ? repository.findAllByOrderByNameAsc()
                : repository.findByTypeIsNullOrTypeOrderByNameAsc(type);
        Map<UUID, Long> counts = repository.countItems().stream()
                .collect(Collectors.toMap(
                        CollectionRepository.CollectionCount::getCollectionId,
                        CollectionRepository.CollectionCount::getTotal));
        return collections.stream()
                .map(collection -> CollectionResponse.from(collection, counts.getOrDefault(collection.getId(), 0L)))
                .toList();
    }

    public CollectionResponse create(CollectionRequest request) {
        String name = request.name().trim();
        if (repository.existsByNameIgnoreCase(name)) {
            throw new EntityExistsException("Collection %s already exists".formatted(name));
        }
        Collection collection = new Collection();
        collection.setId(UUID.randomUUID());
        collection.setName(name);
        collection.setType(request.type());
        return CollectionResponse.from(repository.saveAndFlush(collection), 0);
    }

    public void delete(UUID id) {
        // Hard delete: the collection is just a grouping, its items stay untouched.
        repository.delete(find(id));
    }

    public void addItem(UUID collectionId, UUID itemId) {
        Collection collection = find(collectionId);
        Item item = itemRepository.findByIdAndDeletedAtIsNull(itemId)
                .orElseThrow(() -> new EntityNotFoundException("Item %s not found".formatted(itemId)));
        if (collection.getType() != null && collection.getType() != item.getType()) {
            throw new IllegalArgumentException(
                    "Collection %s only accepts %s items".formatted(collection.getName(), collection.getType()));
        }
        collection.getItems().add(item);
    }

    public void removeItem(UUID collectionId, UUID itemId) {
        find(collectionId).getItems().removeIf(item -> item.getId().equals(itemId));
    }

    @Transactional(readOnly = true)
    public List<UUID> collectionIdsOf(UUID itemId) {
        return repository.findIdsByItemId(itemId);
    }

    public void setItemCollections(UUID itemId, List<UUID> collectionIds) {
        List<UUID> current = repository.findIdsByItemId(itemId);
        current.stream().filter(id -> !collectionIds.contains(id)).forEach(id -> removeItem(id, itemId));
        collectionIds.stream().filter(id -> !current.contains(id)).forEach(id -> addItem(id, itemId));
    }

    private Collection find(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Collection %s not found".formatted(id)));
    }
}

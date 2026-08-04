package com.keepory.collection;

import com.keepory.auth.CurrentUser;
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
    private final CurrentUser currentUser;

    public CollectionService(CollectionRepository repository, ItemRepository itemRepository,
                             CurrentUser currentUser) {
        this.repository = repository;
        this.itemRepository = itemRepository;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public List<CollectionResponse> list(ItemType type) {
        UUID userId = currentUser.id();
        List<Collection> collections = type == null
                ? repository.findByUserIdOrderByNameAsc(userId)
                : repository.findByUserIdAndTypeOrderByNameAsc(userId, type);
        Map<UUID, Long> counts = repository.countItems(userId.toString()).stream()
                .collect(Collectors.toMap(
                        CollectionRepository.CollectionCount::getCollectionId,
                        CollectionRepository.CollectionCount::getTotal));
        Map<UUID, List<String>> covers = repository.findCovers(userId.toString()).stream()
                .collect(Collectors.groupingBy(
                        CollectionRepository.CollectionCover::getCollectionId,
                        Collectors.mapping(CollectionRepository.CollectionCover::getCoverUrl, Collectors.toList())));
        return collections.stream()
                .map(collection -> CollectionResponse.from(
                        collection,
                        counts.getOrDefault(collection.getId(), 0L),
                        covers.getOrDefault(collection.getId(), List.of())))
                .toList();
    }

    public CollectionResponse create(CollectionRequest request) {
        UUID userId = currentUser.id();
        String name = request.name().trim();
        if (repository.existsByNameIgnoreCaseAndTypeAndUserId(name, request.type(), userId)) {
            throw new EntityExistsException("Collection %s already exists".formatted(name));
        }
        Collection collection = new Collection();
        collection.setId(UUID.randomUUID());
        collection.setUserId(userId);
        collection.setName(name);
        collection.setType(request.type());
        return CollectionResponse.from(repository.saveAndFlush(collection), 0);
    }

    // Only the name changes: the type is immutable, switching it would leave
    // items of the wrong type inside the collection.
    public CollectionResponse rename(UUID id, String rawName) {
        Collection collection = find(id);
        String name = rawName.trim();
        if (!collection.getName().equalsIgnoreCase(name)
                && repository.existsByNameIgnoreCaseAndTypeAndUserId(name, collection.getType(), currentUser.id())) {
            throw new EntityExistsException("Collection %s already exists".formatted(name));
        }
        collection.setName(name);
        long items = repository.countItems(currentUser.id().toString()).stream()
                .filter(count -> count.getCollectionId().equals(id))
                .mapToLong(CollectionRepository.CollectionCount::getTotal)
                .findFirst()
                .orElse(0L);
        return CollectionResponse.from(repository.saveAndFlush(collection), items);
    }

    public void delete(UUID id) {
        // Hard delete: the collection is just a grouping, its items stay untouched.
        repository.delete(find(id));
    }

    public void addItem(UUID collectionId, UUID itemId) {
        Collection collection = find(collectionId);
        // Scoped too: you cannot drop someone else's item into your own collection.
        Item item = itemRepository.findByIdAndUserIdAndDeletedAtIsNull(itemId, currentUser.id())
                .orElseThrow(() -> new EntityNotFoundException("Item %s not found".formatted(itemId)));
        if (collection.getType() != item.getType()) {
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
        return repository.findIdsByItemId(itemId, currentUser.id());
    }

    public void setItemCollections(UUID itemId, List<UUID> collectionIds) {
        // A missing body means "no collections", not an error.
        List<UUID> target = collectionIds == null ? List.of() : collectionIds;
        List<UUID> current = repository.findIdsByItemId(itemId, currentUser.id());
        current.stream().filter(id -> !target.contains(id)).forEach(id -> removeItem(id, itemId));
        target.stream().filter(id -> !current.contains(id)).forEach(id -> addItem(id, itemId));
    }

    private Collection find(UUID id) {
        // Someone else's collection reads as missing, never as forbidden.
        return repository.findByIdAndUserId(id, currentUser.id())
                .orElseThrow(() -> new EntityNotFoundException("Collection %s not found".formatted(id)));
    }
}

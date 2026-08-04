package com.keepory.collection;

import com.keepory.collection.dto.CollectionRenameRequest;
import com.keepory.collection.dto.CollectionRequest;
import com.keepory.collection.dto.CollectionResponse;
import com.keepory.item.ItemType;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class CollectionController {

    private final CollectionService service;

    public CollectionController(CollectionService service) {
        this.service = service;
    }

    @GetMapping("/collections")
    public List<CollectionResponse> list(@RequestParam(required = false) ItemType type) {
        return service.list(type);
    }

    @PostMapping("/collections")
    @ResponseStatus(HttpStatus.CREATED)
    public CollectionResponse create(@Valid @RequestBody CollectionRequest request) {
        return service.create(request);
    }

    // Renames only: the type is immutable once the collection exists.
    @PutMapping("/collections/{id}")
    public CollectionResponse rename(@PathVariable UUID id, @Valid @RequestBody CollectionRenameRequest request) {
        return service.rename(id, request.name());
    }

    @DeleteMapping("/collections/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        service.delete(id);
    }

    // Idempotent: adding an item already in the collection is a no-op.
    @PutMapping("/collections/{id}/items/{itemId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void addItem(@PathVariable UUID id, @PathVariable UUID itemId) {
        service.addItem(id, itemId);
    }

    @DeleteMapping("/collections/{id}/items/{itemId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeItem(@PathVariable UUID id, @PathVariable UUID itemId) {
        service.removeItem(id, itemId);
    }

    @GetMapping("/items/{itemId}/collections")
    public List<UUID> collectionsOf(@PathVariable UUID itemId) {
        return service.collectionIdsOf(itemId);
    }

    @PutMapping("/items/{itemId}/collections")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void setCollections(@PathVariable UUID itemId,
                               @RequestBody(required = false) List<UUID> collectionIds) {
        service.setItemCollections(itemId, collectionIds);
    }
}

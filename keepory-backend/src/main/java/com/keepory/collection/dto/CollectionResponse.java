package com.keepory.collection.dto;

import com.keepory.collection.Collection;
import com.keepory.item.ItemType;

import java.util.List;
import java.util.UUID;

public record CollectionResponse(UUID id, String name, ItemType type, long itemCount, List<String> covers) {

    public static CollectionResponse from(Collection collection, long itemCount) {
        return from(collection, itemCount, List.of());
    }

    public static CollectionResponse from(Collection collection, long itemCount, List<String> covers) {
        return new CollectionResponse(collection.getId(), collection.getName(), collection.getType(), itemCount, covers);
    }
}

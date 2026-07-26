package com.keepory.collection.dto;

import com.keepory.collection.Collection;
import com.keepory.item.ItemType;

import java.util.UUID;

public record CollectionResponse(UUID id, String name, ItemType type, long itemCount) {

    public static CollectionResponse from(Collection collection, long itemCount) {
        return new CollectionResponse(collection.getId(), collection.getName(), collection.getType(), itemCount);
    }
}

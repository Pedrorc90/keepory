package com.keepory.collection.dto;

import com.keepory.item.ItemType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CollectionRequest(
        @NotBlank @Size(max = 120) String name,
        ItemType type) {
}

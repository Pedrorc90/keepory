package com.keepory.item.dto;

import com.keepory.item.Item;
import com.keepory.item.ItemStatus;
import com.keepory.item.ItemType;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

public record ItemResponse(
        UUID id,
        ItemType type,
        String title,
        String coverUrl,
        ItemStatus status,
        Integer rating,
        LocalDate completedAt,
        String notes,
        Map<String, Object> attributes,
        String source,
        String externalId,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt) {

    public static ItemResponse from(Item item) {
        return new ItemResponse(
                item.getId(),
                item.getType(),
                item.getTitle(),
                item.getCoverUrl(),
                item.getStatus(),
                item.getRating(),
                item.getCompletedAt(),
                item.getNotes(),
                item.getAttributes(),
                item.getSource(),
                item.getExternalId(),
                item.getCreatedAt(),
                item.getUpdatedAt());
    }
}

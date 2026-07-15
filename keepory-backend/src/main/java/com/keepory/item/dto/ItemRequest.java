package com.keepory.item.dto;

import com.keepory.item.ItemStatus;
import com.keepory.item.ItemType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

public record ItemRequest(
        UUID id,
        @NotNull ItemType type,
        @NotBlank @Size(max = 255) String title,
        String coverUrl,
        @NotNull ItemStatus status,
        @Min(1) @Max(5) Integer rating,
        LocalDate completedAt,
        String notes,
        Map<String, Object> attributes,
        @Size(max = 20) String source,
        @Size(max = 100) String externalId) {
}

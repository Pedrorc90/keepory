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

public record ItemRequest(
        @NotNull ItemType type,
        @NotBlank @Size(max = 255) String title,
        String coverUrl,
        @NotNull ItemStatus status,
        @Min(1) @Max(5) Integer rating,
        LocalDate completedAt,
        String notes,
        Map<String, Object> attributes) {
}

package com.keepory.metadata.dto;

public record MetadataSearchResult(
        String source,
        String externalId,
        String title,
        Integer year,
        String coverUrl,
        String description) {
}

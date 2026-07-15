package com.keepory.metadata.dto;

import java.util.Map;

public record MetadataDetail(
        String source,
        String externalId,
        String title,
        Integer year,
        String coverUrl,
        Map<String, Object> attributes) {

    public MetadataDetail withCoverUrl(String url) {
        return new MetadataDetail(source, externalId, title, year, url, attributes);
    }
}

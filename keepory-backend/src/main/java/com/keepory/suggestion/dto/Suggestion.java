package com.keepory.suggestion.dto;

public record Suggestion(
        String source,
        String externalId,
        String title,
        Integer year,
        String coverUrl,
        String overview,
        Double voteAverage) {
}

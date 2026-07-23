package com.keepory.suggestion.dto;

public record MovieSuggestion(
        String source,
        String externalId,
        String title,
        Integer year,
        String coverUrl,
        String overview,
        Double voteAverage) {
}

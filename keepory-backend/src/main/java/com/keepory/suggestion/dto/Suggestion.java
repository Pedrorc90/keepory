package com.keepory.suggestion.dto;

import java.util.List;

public record Suggestion(
        String source,
        String externalId,
        String title,
        Integer year,
        String coverUrl,
        String overview,
        Double voteAverage,
        /** Streaming services with a flat-rate offer in Spain. */
        List<String> providers,
        /** YouTube key of the trailer, null when the title has none. */
        String trailerKey) {

    /** A suggestion as the listing endpoints give it, before enrichment. */
    public Suggestion(String source, String externalId, String title, Integer year,
                      String coverUrl, String overview, Double voteAverage) {
        this(source, externalId, title, year, coverUrl, overview, voteAverage, List.of(), null);
    }

    public Suggestion withExtras(List<String> providers, String trailerKey) {
        return new Suggestion(source, externalId, title, year, coverUrl, overview, voteAverage,
                providers, trailerKey);
    }
}

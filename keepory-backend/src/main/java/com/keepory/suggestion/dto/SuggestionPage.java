package com.keepory.suggestion.dto;

import java.util.List;

/** One page of a provider listing, plus how many pages the query really has. */
public record SuggestionPage(List<Suggestion> results, int totalPages) {
}

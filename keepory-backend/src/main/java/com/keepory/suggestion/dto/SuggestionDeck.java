package com.keepory.suggestion.dto;

import java.util.List;

public record SuggestionDeck(String id, String title, List<Suggestion> suggestions) {
}

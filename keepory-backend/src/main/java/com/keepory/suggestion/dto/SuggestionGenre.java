package com.keepory.suggestion.dto;

/**
 * A browsable chip; {@code deckId} is what the deck endpoints expect and
 * {@code group} is the row it belongs to in the UI (genre, decade, director).
 */
public record SuggestionGenre(String deckId, String name, String group) {
}

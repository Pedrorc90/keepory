package com.keepory.suggestion.dto;

/** A browsable genre; {@code deckId} is what the deck endpoints expect. */
public record SuggestionGenre(String deckId, String name) {
}

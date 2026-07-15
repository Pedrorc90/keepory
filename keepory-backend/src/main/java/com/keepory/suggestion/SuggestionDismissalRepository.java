package com.keepory.suggestion;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SuggestionDismissalRepository
        extends JpaRepository<SuggestionDismissal, SuggestionDismissal.Key> {

    List<SuggestionDismissal> findBySource(String source);
}

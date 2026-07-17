package com.keepory.suggestion;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.OffsetDateTime;
import java.util.List;

public interface SuggestionDismissalRepository
        extends JpaRepository<SuggestionDismissal, SuggestionDismissal.Key> {

    List<SuggestionDismissal> findBySourceAndDismissedAtAfter(String source, OffsetDateTime after);
}

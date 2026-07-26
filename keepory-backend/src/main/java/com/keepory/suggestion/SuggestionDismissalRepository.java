package com.keepory.suggestion;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface SuggestionDismissalRepository
        extends JpaRepository<SuggestionDismissal, SuggestionDismissal.Key> {

    List<SuggestionDismissal> findByUserIdAndSourceAndDismissedAtAfter(
            UUID userId, String source, OffsetDateTime after);
}

package com.keepory.suggestion;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "suggestion_dismissal")
@IdClass(SuggestionDismissal.Key.class)
public class SuggestionDismissal {

    // Part of the key: a dismissal is personal, so the same film can be
    // dismissed by one user and still suggested to another.
    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Id
    @Column(length = 20)
    private String source;

    @Id
    @Column(name = "external_id", length = 100)
    private String externalId;

    @Column(name = "dismissed_at", nullable = false)
    private OffsetDateTime dismissedAt = OffsetDateTime.now();

    protected SuggestionDismissal() {
    }

    public SuggestionDismissal(UUID userId, String source, String externalId) {
        this.userId = userId;
        this.source = source;
        this.externalId = externalId;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getSource() {
        return source;
    }

    public String getExternalId() {
        return externalId;
    }

    public OffsetDateTime getDismissedAt() {
        return dismissedAt;
    }

    public static class Key implements Serializable {

        private UUID userId;
        private String source;
        private String externalId;

        public Key() {
        }

        public Key(UUID userId, String source, String externalId) {
            this.userId = userId;
            this.source = source;
            this.externalId = externalId;
        }

        @Override
        public boolean equals(Object o) {
            return o instanceof Key other
                    && Objects.equals(userId, other.userId)
                    && Objects.equals(source, other.source)
                    && Objects.equals(externalId, other.externalId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, source, externalId);
        }
    }
}

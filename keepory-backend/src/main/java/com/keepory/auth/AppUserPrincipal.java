package com.keepory.auth;

import org.springframework.security.core.AuthenticatedPrincipal;

import java.io.Serializable;
import java.util.UUID;

/**
 * What ends up inside the session row, so it stays small and serialisable:
 * never the entity, never the password hash. The id is what F5.2b will use to
 * scope every query to its owner.
 */
public record AppUserPrincipal(UUID id, String email, String displayName)
        implements AuthenticatedPrincipal, Serializable {

    /**
     * Spring Session stores this in SPRING_SESSION.PRINCIPAL_NAME. Without it,
     * Authentication#getName falls back to toString() and writes the whole record.
     */
    @Override
    public String getName() {
        return email;
    }

    static AppUserPrincipal of(AppUser user) {
        return new AppUserPrincipal(user.getId(), user.getEmail(), user.getDisplayName());
    }
}

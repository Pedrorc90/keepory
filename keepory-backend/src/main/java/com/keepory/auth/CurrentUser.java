package com.keepory.auth;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * The owner of whatever the request is about. Services ask for it instead of
 * receiving it from the controller: a forgotten parameter would silently widen
 * a query to everyone's data, a missing session here throws.
 */
@Component
public class CurrentUser {

    public UUID id() {
        return principal().id();
    }

    public AppUserPrincipal principal() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AppUserPrincipal principal)) {
            // SecurityConfig authenticates every /api/** route, so this means a bug,
            // not a logged-out visitor.
            throw new IllegalStateException("No authenticated user in the security context");
        }
        return principal;
    }
}

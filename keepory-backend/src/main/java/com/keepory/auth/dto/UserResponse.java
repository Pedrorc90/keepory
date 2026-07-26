package com.keepory.auth.dto;

import com.keepory.auth.AppUserPrincipal;

import java.util.UUID;

public record UserResponse(UUID id, String email, String displayName) {

    public static UserResponse from(AppUserPrincipal principal) {
        return new UserResponse(principal.id(), principal.email(), principal.displayName());
    }
}

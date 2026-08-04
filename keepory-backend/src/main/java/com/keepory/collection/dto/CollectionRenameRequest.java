package com.keepory.collection.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// Its own record instead of reusing CollectionRequest: renaming never sends a
// type, and the type is mandatory on create.
public record CollectionRenameRequest(
        @NotBlank @Size(max = 120) String name) {
}

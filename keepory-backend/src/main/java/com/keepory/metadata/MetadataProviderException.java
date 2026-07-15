package com.keepory.metadata;

public class MetadataProviderException extends RuntimeException {

    public MetadataProviderException(String message) {
        super(message);
    }

    public MetadataProviderException(String message, Throwable cause) {
        super(message, cause);
    }
}

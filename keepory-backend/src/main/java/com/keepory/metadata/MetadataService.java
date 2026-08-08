package com.keepory.metadata;

import com.keepory.item.ItemType;
import com.keepory.metadata.dto.MetadataDetail;
import com.keepory.metadata.dto.MetadataSearchResult;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class MetadataService {

    private final TmdbClient tmdb;
    private final GoogleBooksClient googleBooks;
    private final RawgClient rawg;

    public MetadataService(TmdbClient tmdb, GoogleBooksClient googleBooks, RawgClient rawg) {
        this.tmdb = tmdb;
        this.googleBooks = googleBooks;
        this.rawg = rawg;
    }

    public List<MetadataSearchResult> search(ItemType type, String query) {
        if (query == null || query.isBlank()) {
            return List.of();
        }
        return switch (type) {
            case MOVIE -> tmdb.search(TmdbMedia.MOVIE, query.trim());
            case SERIES -> tmdb.search(TmdbMedia.TV, query.trim());
            case BOOK -> googleBooks.search(query.trim());
            case GAME -> rawg.search(query.trim());
        };
    }

    public MetadataDetail detail(ItemType type, String externalId) {
        return switch (type) {
            case MOVIE -> tmdb.detail(TmdbMedia.MOVIE, externalId);
            case SERIES -> tmdb.detail(TmdbMedia.TV, externalId);
            case BOOK -> googleBooks.detail(externalId);
            case GAME -> rawg.detail(externalId);
        };
    }
}

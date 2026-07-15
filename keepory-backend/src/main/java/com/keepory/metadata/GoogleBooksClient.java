package com.keepory.metadata;

import com.keepory.metadata.dto.MetadataDetail;
import com.keepory.metadata.dto.MetadataSearchResult;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriBuilder;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

@Component
public class GoogleBooksClient {

    public static final String SOURCE = "GOOGLE_BOOKS";

    private final RestClient client;
    private final String apiKey;

    public GoogleBooksClient(RestClient.Builder builder,
                             @Value("${keepory.google-books.api-key}") String apiKey) {
        this.client = builder.baseUrl("https://www.googleapis.com/books/v1").build();
        this.apiKey = apiKey;
    }

    public List<MetadataSearchResult> search(String query) {
        SearchResponse response;
        try {
            response = client.get().uri(uri -> withKey(uri.path("/volumes")
                            .queryParam("q", query)
                            .queryParam("maxResults", 10)
                            .queryParam("printType", "books"))
                            .build())
                    .retrieve()
                    .body(SearchResponse.class);
        } catch (RestClientException ex) {
            throw new MetadataProviderException("Google Books request failed: " + ex.getMessage(), ex);
        }
        if (response == null || response.items() == null) {
            return List.of();
        }
        return response.items().stream()
                .filter(v -> v.volumeInfo() != null && v.volumeInfo().title() != null)
                .map(v -> new MetadataSearchResult(SOURCE, v.id(), v.volumeInfo().title(),
                        year(v.volumeInfo().publishedDate()), cover(v.volumeInfo().imageLinks()),
                        v.volumeInfo().description()))
                .toList();
    }

    public MetadataDetail detail(String externalId) {
        Volume volume;
        try {
            volume = client.get().uri(uri -> withKey(uri.path("/volumes/{id}")).build(externalId))
                    .retrieve()
                    .body(Volume.class);
        } catch (RestClientException ex) {
            throw new MetadataProviderException("Google Books request failed: " + ex.getMessage(), ex);
        }
        if (volume == null || volume.volumeInfo() == null) {
            throw new MetadataProviderException("Google Books volume %s not found".formatted(externalId));
        }
        VolumeInfo info = volume.volumeInfo();

        String isbn = isbn(info.industryIdentifiers());

        Map<String, Object> attributes = new LinkedHashMap<>();
        if (info.authors() != null && !info.authors().isEmpty()) {
            attributes.put("authors", info.authors());
        }
        put(attributes, "pageCount", info.pageCount());
        put(attributes, "publisher", info.publisher());
        put(attributes, "year", year(info.publishedDate()));
        put(attributes, "isbn", isbn);
        if (info.categories() != null && !info.categories().isEmpty()) {
            attributes.put("categories", info.categories());
        }

        return new MetadataDetail(SOURCE, externalId, info.title(), year(info.publishedDate()),
                cover(isbn, info.imageLinks()), attributes);
    }

    // Anonymous Google Books access has zero daily quota; a (free) API key lifts it.
    private UriBuilder withKey(UriBuilder uri) {
        return apiKey == null || apiKey.isBlank() ? uri : uri.queryParam("key", apiKey);
    }

    private static Integer year(String publishedDate) {
        if (publishedDate == null || publishedDate.length() < 4) {
            return null;
        }
        try {
            return Integer.parseInt(publishedDate.substring(0, 4));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    /**
     * Prefers Open Library covers by ISBN (hotlink-friendly licensing); falls back
     * to the Google Books image link when no ISBN is available.
     */
    private static String cover(String isbn, ImageLinks links) {
        if (isbn != null) {
            return "https://covers.openlibrary.org/b/isbn/%s-L.jpg".formatted(isbn);
        }
        return cover(links);
    }

    private static String cover(ImageLinks links) {
        if (links == null) {
            return null;
        }
        return Stream.of(links.extraLarge(), links.large(), links.medium(),
                        links.small(), links.thumbnail(), links.smallThumbnail())
                .filter(url -> url != null && !url.isBlank())
                .findFirst()
                .map(url -> url.replaceFirst("^http:", "https:").replace("&edge=curl", ""))
                .orElse(null);
    }

    private static String isbn(List<IndustryIdentifier> identifiers) {
        if (identifiers == null) {
            return null;
        }
        return identifiers.stream()
                .filter(i -> "ISBN_13".equals(i.type()))
                .findFirst()
                .or(() -> identifiers.stream().filter(i -> "ISBN_10".equals(i.type())).findFirst())
                .map(IndustryIdentifier::identifier)
                .orElse(null);
    }

    private static void put(Map<String, Object> map, String key, Object value) {
        if (value != null) {
            map.put(key, value);
        }
    }

    private record SearchResponse(List<Volume> items) {
    }

    private record Volume(String id, VolumeInfo volumeInfo) {
    }

    private record VolumeInfo(String title,
                              List<String> authors,
                              String publisher,
                              String publishedDate,
                              String description,
                              Integer pageCount,
                              List<String> categories,
                              List<IndustryIdentifier> industryIdentifiers,
                              ImageLinks imageLinks) {
    }

    private record IndustryIdentifier(String type, String identifier) {
    }

    private record ImageLinks(String smallThumbnail,
                              String thumbnail,
                              String small,
                              String medium,
                              String large,
                              String extraLarge) {
    }
}

package com.keepory.metadata;

import com.keepory.metadata.dto.MetadataDetail;
import com.keepory.metadata.dto.MetadataSearchResult;
import com.keepory.suggestion.dto.Suggestion;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriBuilder;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import java.util.stream.Stream;

@Component
public class GoogleBooksClient {

    public static final String SOURCE = "GOOGLE_BOOKS";

    // Google Books randomly answers 503 backendFailed (~40% of keyed requests as of
    // 2026-07); retrying is the documented client-side mitigation.
    private static final int MAX_ATTEMPTS = 4;
    private static final long RETRY_DELAY_MS = 150;

    private final RestClient client;
    private final RestClient covers;
    private final String apiKey;

    // books.googleapis.com, not www.googleapis.com: volume search on the legacy
    // host fails with 503 backendFailed for keyed requests.
    public GoogleBooksClient(RestClient.Builder builder,
                             @Value("${keepory.google-books.api-key}") String apiKey) {
        this.client = builder.baseUrl("https://books.googleapis.com/books/v1").build();
        this.covers = builder.baseUrl("https://covers.openlibrary.org").build();
        this.apiKey = apiKey;
    }

    public List<MetadataSearchResult> search(String query) {
        SearchResponse response;
        try {
            response = withRetry(() -> client.get().uri(uri -> withKey(uri.path("/volumes")
                            .queryParam("q", query)
                            .queryParam("maxResults", 10)
                            .queryParam("printType", "books"))
                            .build())
                    .retrieve()
                    .body(SearchResponse.class));
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

    /**
     * Seed-driven discovery for suggestions: Spanish-only, relevance-ordered results
     * for an {@code inauthor:}/{@code subject:} query. Covers come straight from
     * imageLinks — no Open Library HEAD probe, it would add one request per result —
     * and volumes without one are dropped rather than shown blank.
     */
    public List<Suggestion> discover(String query) {
        SearchResponse response;
        try {
            response = withRetry(() -> client.get().uri(uri -> withKey(uri.path("/volumes")
                            .queryParam("q", query)
                            .queryParam("maxResults", 20)
                            .queryParam("printType", "books")
                            .queryParam("langRestrict", "es"))
                            .build())
                    .retrieve()
                    .body(SearchResponse.class));
        } catch (RestClientException ex) {
            throw new MetadataProviderException("Google Books request failed: " + ex.getMessage(), ex);
        }
        if (response == null || response.items() == null) {
            return List.of();
        }
        return response.items().stream()
                .filter(v -> v.volumeInfo() != null && v.volumeInfo().title() != null)
                .filter(v -> looksSpanish(v.volumeInfo().title(), v.volumeInfo().description()))
                .map(v -> new Suggestion(SOURCE, v.id(), v.volumeInfo().title(),
                        year(v.volumeInfo().publishedDate()), cover(v.volumeInfo().imageLinks()),
                        v.volumeInfo().description(), v.volumeInfo().averageRating()))
                // A coverless card is a hole in the shelf, and a volume Google has no
                // thumbnail for is a thin catalog record anyway: better dropped than shown.
                .filter(s -> s.coverUrl() != null)
                .toList();
    }

    // langRestrict alone is not enough: the catalog mislabels plenty of English
    // volumes (comics especially) as Spanish, so check the visible text too.
    private static boolean looksSpanish(String title, String description) {
        String text = (" " + title + " " + (description == null ? "" : description) + " ").toLowerCase();
        if (text.chars().anyMatch(c -> "áéíóúñ¿¡".indexOf(c) >= 0)) {
            return true;
        }
        int spanish = markers(text, " el ", " la ", " los ", " las ", " de ", " del ", " que ", " una ", " es ", " para ");
        int english = markers(text, " the ", " of ", " and ", " with ", " from ", " his ", " her ");
        return spanish > english;
    }

    private static int markers(String text, String... words) {
        int count = 0;
        for (String word : words) {
            if (text.contains(word)) {
                count++;
            }
        }
        return count;
    }

    public MetadataDetail detail(String externalId) {
        Volume volume;
        try {
            volume = withRetry(() -> client.get().uri(uri -> withKey(uri.path("/volumes/{id}")).build(externalId))
                    .retrieve()
                    .body(Volume.class));
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

    private <T> T withRetry(Supplier<T> call) {
        HttpServerErrorException.ServiceUnavailable last = null;
        for (int attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            try {
                return call.get();
            } catch (HttpServerErrorException.ServiceUnavailable ex) {
                last = ex;
                try {
                    Thread.sleep(RETRY_DELAY_MS << attempt);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw ex;
                }
            }
        }
        throw last;
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
     * to the Google Books image link when Open Library has no image for the ISBN.
     */
    private String cover(String isbn, ImageLinks links) {
        if (isbn != null && openLibraryHasCover(isbn)) {
            return "https://covers.openlibrary.org/b/isbn/%s-L.jpg".formatted(isbn);
        }
        return cover(links);
    }

    // Open Library serves a blank placeholder for unknown ISBNs; default=false
    // turns that into a 404 so missing covers are detectable.
    private boolean openLibraryHasCover(String isbn) {
        try {
            covers.head().uri("/b/isbn/{isbn}-L.jpg?default=false", isbn)
                    .retrieve()
                    .toBodilessEntity();
            return true;
        } catch (RestClientException ex) {
            return false;
        }
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
                              Double averageRating,
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

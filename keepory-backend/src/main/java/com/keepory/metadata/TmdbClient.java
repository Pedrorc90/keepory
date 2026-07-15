package com.keepory.metadata;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.keepory.metadata.dto.MetadataDetail;
import com.keepory.metadata.dto.MetadataSearchResult;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.web.util.UriBuilder;

@Component
public class TmdbClient {

    public static final String SOURCE = "TMDB";

    private static final String IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
    private static final String LANGUAGE = "es-ES";

    private final RestClient client;
    private final String apiKey;

    public TmdbClient(RestClient.Builder builder, @Value("${keepory.tmdb.api-key}") String apiKey) {
        this.client = builder.baseUrl("https://api.themoviedb.org/3").build();
        this.apiKey = apiKey;
    }

    public List<MetadataSearchResult> search(String query) {
        SearchResponse response = get(uri -> uri.path("/search/movie")
                .queryParam("query", query)
                .queryParam("language", LANGUAGE)
                .queryParam("api_key", apiKey)
                .build(), SearchResponse.class);
        if (response == null || response.results() == null) {
            return List.of();
        }
        return response.results().stream()
                .limit(10)
                .map(m -> new MetadataSearchResult(SOURCE, String.valueOf(m.id()), m.title(),
                        year(m.releaseDate()), cover(m.posterPath()), m.overview()))
                .toList();
    }

    public MetadataDetail detail(String externalId) {
        MovieDetail m = get(uri -> uri.path("/movie/{id}")
                .queryParam("language", LANGUAGE)
                .queryParam("append_to_response", "credits")
                .queryParam("api_key", apiKey)
                .build(externalId), MovieDetail.class);

        Map<String, Object> attributes = new LinkedHashMap<>();
        put(attributes, "director", director(m.credits()));
        put(attributes, "durationMinutes", m.runtime());
        if (m.genres() != null && !m.genres().isEmpty()) {
            attributes.put("genres", m.genres().stream().map(Genre::name).toList());
        }
        put(attributes, "year", year(m.releaseDate()));
        if (m.originalTitle() != null && !m.originalTitle().equals(m.title())) {
            attributes.put("originalTitle", m.originalTitle());
        }

        return new MetadataDetail(SOURCE, externalId, m.title(), year(m.releaseDate()),
                cover(m.posterPath()), attributes);
    }

    private <T> T get(Function<UriBuilder, URI> uri, Class<T> type) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new MetadataProviderException("TMDB_API_KEY is not configured");
        }
        try {
            return client.get().uri(uri).retrieve().body(type);
        } catch (RestClientException ex) {
            throw new MetadataProviderException("TMDB request failed: " + ex.getMessage(), ex);
        }
    }

    private static String director(Credits credits) {
        if (credits == null || credits.crew() == null) {
            return null;
        }
        String directors = credits.crew().stream()
                .filter(c -> "Director".equals(c.job()))
                .map(CrewMember::name)
                .collect(Collectors.joining(", "));
        return directors.isEmpty() ? null : directors;
    }

    private static Integer year(String releaseDate) {
        if (releaseDate == null || releaseDate.length() < 4) {
            return null;
        }
        try {
            return Integer.parseInt(releaseDate.substring(0, 4));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private static String cover(String posterPath) {
        return posterPath == null ? null : IMAGE_BASE + posterPath;
    }

    private static void put(Map<String, Object> map, String key, Object value) {
        if (value != null) {
            map.put(key, value);
        }
    }

    private record SearchResponse(List<MovieResult> results) {
    }

    private record MovieResult(long id,
                               String title,
                               @JsonProperty("release_date") String releaseDate,
                               @JsonProperty("poster_path") String posterPath,
                               String overview) {
    }

    private record MovieDetail(long id,
                               String title,
                               @JsonProperty("original_title") String originalTitle,
                               @JsonProperty("release_date") String releaseDate,
                               @JsonProperty("poster_path") String posterPath,
                               Integer runtime,
                               List<Genre> genres,
                               Credits credits) {
    }

    private record Genre(String name) {
    }

    private record Credits(List<CrewMember> crew) {
    }

    private record CrewMember(String name, String job) {
    }
}

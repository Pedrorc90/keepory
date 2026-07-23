package com.keepory.metadata;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.keepory.metadata.dto.MetadataDetail;
import com.keepory.metadata.dto.MetadataSearchResult;
import com.keepory.suggestion.dto.Suggestion;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.web.util.UriBuilder;

@Component
public class TmdbClient {

    public static final String SOURCE = "TMDB";

    private static final String IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
    private static final String LANGUAGE = "es-ES";
    private static final String WATCH_REGION = "ES";

    private final RestClient client;
    private final String apiKey;
    // TMDB's genre catalog is static; fetched once per app run.
    private volatile Map<String, Integer> genreIdsByName;

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
                .queryParam("append_to_response", "credits,watch/providers")
                .queryParam("api_key", apiKey)
                .build(externalId), MovieDetail.class);

        Map<String, Object> attributes = new LinkedHashMap<>();
        put(attributes, "director", director(m.credits()));
        put(attributes, "durationMinutes", m.runtime());
        if (m.genres() != null && !m.genres().isEmpty()) {
            attributes.put("genres", m.genres().stream().map(Genre::name).toList());
        }
        put(attributes, "year", year(m.releaseDate()));
        List<String> providers = flatrateProviders(m.watchProviders());
        if (!providers.isEmpty()) {
            attributes.put("watchProviders", providers);
        }
        if (m.originalTitle() != null && !m.originalTitle().equals(m.title())) {
            attributes.put("originalTitle", m.originalTitle());
        }

        return new MetadataDetail(SOURCE, externalId, m.title(), year(m.releaseDate()),
                cover(m.posterPath()), attributes);
    }

    public List<Suggestion> recommendations(String externalId) {
        return suggestions(get(uri -> uri.path("/movie/{id}/recommendations")
                .queryParam("language", LANGUAGE)
                .queryParam("api_key", apiKey)
                .build(externalId), MovieListResponse.class));
    }

    public List<Suggestion> discoverByGenre(int genreId, int page) {
        return suggestions(get(uri -> uri.path("/discover/movie")
                .queryParam("with_genres", genreId)
                .queryParam("sort_by", "popularity.desc")
                // Popularity alone surfaces obscure catalog noise; require a vote floor.
                .queryParam("vote_count.gte", 200)
                .queryParam("page", page)
                .queryParam("language", LANGUAGE)
                .queryParam("api_key", apiKey)
                .build(), MovieListResponse.class));
    }

    public Map<String, Integer> genreIdsByName() {
        Map<String, Integer> cached = genreIdsByName;
        if (cached == null) {
            GenreListResponse response = get(uri -> uri.path("/genre/movie/list")
                    .queryParam("language", LANGUAGE)
                    .queryParam("api_key", apiKey)
                    .build(), GenreListResponse.class);
            cached = response == null || response.genres() == null ? Map.of()
                    : response.genres().stream().collect(Collectors.toUnmodifiableMap(
                            g -> g.name().toLowerCase(Locale.ROOT), Genre::id, (a, b) -> a));
            genreIdsByName = cached;
        }
        return cached;
    }

    private static List<Suggestion> suggestions(MovieListResponse response) {
        if (response == null || response.results() == null) {
            return List.of();
        }
        return response.results().stream()
                .filter(m -> m.title() != null)
                .map(m -> new Suggestion(SOURCE, String.valueOf(m.id()), m.title(),
                        year(m.releaseDate()), cover(m.posterPath()), m.overview(), m.voteAverage()))
                .toList();
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

    private static List<String> flatrateProviders(WatchProviders watchProviders) {
        if (watchProviders == null || watchProviders.results() == null) {
            return List.of();
        }
        CountryProviders region = watchProviders.results().get(WATCH_REGION);
        if (region == null || region.flatrate() == null) {
            return List.of();
        }
        return region.flatrate().stream()
                .map(Provider::providerName)
                .filter(Objects::nonNull)
                .map(TmdbClient::normalizeProvider)
                .distinct()
                .toList();
    }

    // TMDB lists ad-tier, Amazon-channel and add-on package variants as separate
    // providers; collapse them into the base service so the UI shows one badge.
    private static String normalizeProvider(String name) {
        return name.trim()
                .replaceFirst("\\s+(Standard )?with Ads$", "")
                .replaceFirst("\\s+Amazon Channels?$", "")
                .replaceFirst("\\s+Ficción Total$", "")
                .trim();
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
                               Credits credits,
                               @JsonProperty("watch/providers") WatchProviders watchProviders) {
    }

    private record WatchProviders(Map<String, CountryProviders> results) {
    }

    private record CountryProviders(List<Provider> flatrate) {
    }

    private record Provider(@JsonProperty("provider_name") String providerName) {
    }

    private record MovieListResponse(List<ListedMovie> results) {
    }

    private record ListedMovie(long id,
                               String title,
                               @JsonProperty("release_date") String releaseDate,
                               @JsonProperty("poster_path") String posterPath,
                               String overview,
                               @JsonProperty("vote_average") Double voteAverage) {
    }

    private record GenreListResponse(List<Genre> genres) {
    }

    private record Genre(int id, String name) {
    }

    private record Credits(List<CrewMember> crew) {
    }

    private record CrewMember(String name, String job) {
    }
}

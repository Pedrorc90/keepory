package com.keepory.metadata;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.keepory.metadata.dto.MetadataDetail;
import com.keepory.metadata.dto.MetadataSearchResult;
import com.keepory.suggestion.dto.Suggestion;
import com.keepory.suggestion.dto.SuggestionPage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;
import java.util.function.Function;
import java.util.function.UnaryOperator;
import java.util.stream.Collectors;

import org.springframework.web.util.UriBuilder;

@Component
public class TmdbClient {

    public static final String SOURCE = "TMDB";

    private static final String IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
    private static final String LANGUAGE = "es-ES";
    private static final String WATCH_REGION = "ES";
    // Discover refuses anything past page 500 whatever total_pages claims.
    private static final int MAX_PAGE = 500;
    // Catalogs and trailers move slowly, and the same titles come back deck
    // after deck, so a long-lived cache keeps enrichment down to a few calls.
    private static final long EXTRAS_TTL_MS = Duration.ofHours(12).toMillis();
    private static final int EXTRAS_CACHE_MAX = 2000;
    private static final MovieExtras NO_EXTRAS = new MovieExtras(List.of(), null);
    // Detail calls in flight at once. All 45 of a cold desktop load would sit on
    // TMDB's rate limit; 30 keeps the pipeline full without courting a 429.
    private static final int MAX_IN_FLIGHT = 30;

    private final RestClient client;
    private final String apiKey;
    // TMDB's genre catalog is static; fetched once per app run.
    private volatile Map<String, Integer> genreIdsByName;
    private final Map<String, CacheEntry> extrasCache = new ConcurrentHashMap<>();
    private final Semaphore inFlight = new Semaphore(MAX_IN_FLIGHT);

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

    public SuggestionPage discoverByGenre(int genreId, int page, int voteFloor) {
        return discover(uri -> uri.queryParam("with_genres", genreId), page, voteFloor);
    }

    /** Everything released in the ten years starting at {@code startYear}. */
    public SuggestionPage discoverByDecade(int startYear, int page, int voteFloor) {
        return discover(uri -> uri
                .queryParam("primary_release_date.gte", startYear + "-01-01")
                .queryParam("primary_release_date.lte", (startYear + 9) + "-12-31"), page, voteFloor);
    }

    // Popularity alone surfaces obscure catalog noise, so callers start with a
    // vote floor; a floor of 0 means they ran out of well-voted titles and will
    // take anything rather than show an empty row.
    private SuggestionPage discover(UnaryOperator<UriBuilder> filter, int page, int voteFloor) {
        return page(get(uri -> {
            UriBuilder builder = filter.apply(uri.path("/discover/movie"));
            if (voteFloor > 0) {
                builder = builder.queryParam("vote_count.gte", voteFloor);
            }
            return builder
                    .queryParam("sort_by", "popularity.desc")
                    .queryParam("page", page)
                    .queryParam("language", LANGUAGE)
                    .queryParam("api_key", apiKey)
                    .build();
        }, MovieListResponse.class));
    }

    // Released in the last weeks in Spain; the shelf's "what's new" row.
    public SuggestionPage nowPlaying(int page) {
        return page(get(uri -> uri.path("/movie/now_playing")
                .queryParam("region", WATCH_REGION)
                .queryParam("page", page)
                .queryParam("language", LANGUAGE)
                .queryParam("api_key", apiKey)
                .build(), MovieListResponse.class));
    }

    // The listing endpoints know nothing about providers or videos, so each
    // suggestion needs its own detail call. They run on virtual threads: a deck
    // costs one round trip in wall-clock rather than fifteen.
    public List<Suggestion> enrich(List<Suggestion> suggestions) {
        if (suggestions.isEmpty()) {
            return suggestions;
        }
        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            List<Future<MovieExtras>> pending = suggestions.stream()
                    .map(s -> executor.submit(() -> throttled(s.externalId())))
                    .toList();
            List<Suggestion> enriched = new ArrayList<>(suggestions.size());
            for (int i = 0; i < suggestions.size(); i++) {
                MovieExtras extras = await(pending.get(i));
                enriched.add(suggestions.get(i).withExtras(extras.providers(), extras.trailerKey()));
            }
            return enriched;
        }
    }

    // A cache hit still takes a permit, but it releases it without a round trip.
    private MovieExtras throttled(String externalId) throws InterruptedException {
        inFlight.acquire();
        try {
            return extras(externalId);
        } finally {
            inFlight.release();
        }
    }

    private static MovieExtras await(Future<MovieExtras> future) {
        try {
            return future.get();
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            return NO_EXTRAS;
        } catch (ExecutionException ex) {
            return NO_EXTRAS;
        }
    }

    private MovieExtras extras(String externalId) {
        long now = System.currentTimeMillis();
        CacheEntry cached = extrasCache.get(externalId);
        if (cached != null && cached.expiresAt() > now) {
            return cached.extras();
        }
        MovieExtras extras;
        try {
            MovieDetail m = get(uri -> uri.path("/movie/{id}")
                    .queryParam("language", LANGUAGE)
                    .queryParam("append_to_response", "videos,watch/providers")
                    // Spanish trailers are the exception, so accept the English
                    // and untagged ones rather than come back empty.
                    .queryParam("include_video_language", "es,en,null")
                    .queryParam("api_key", apiKey)
                    .build(externalId), MovieDetail.class);
            if (m == null) {
                return NO_EXTRAS;
            }
            extras = new MovieExtras(flatrateProviders(m.watchProviders()), trailerKey(m.videos()));
        } catch (MetadataProviderException ex) {
            // A card without a badge beats a deck that fails to load.
            return NO_EXTRAS;
        }
        if (extrasCache.size() >= EXTRAS_CACHE_MAX) {
            extrasCache.values().removeIf(entry -> entry.expiresAt() <= now);
        }
        extrasCache.put(externalId, new CacheEntry(extras, now + EXTRAS_TTL_MS));
        return extras;
    }

    private static String trailerKey(Videos videos) {
        if (videos == null || videos.results() == null) {
            return null;
        }
        return videos.results().stream()
                .filter(v -> v.key() != null && "YouTube".equalsIgnoreCase(v.site()))
                .filter(v -> "Trailer".equalsIgnoreCase(v.type()) || "Teaser".equalsIgnoreCase(v.type()))
                .min(Comparator.comparingInt(TmdbClient::trailerRank))
                .map(Video::key)
                .orElse(null);
    }

    // An official Spanish trailer first, a foreign teaser last.
    private static int trailerRank(Video video) {
        int rank = "Trailer".equalsIgnoreCase(video.type()) ? 0 : 4;
        if (!"es".equalsIgnoreCase(video.language())) {
            rank += 2;
        }
        if (!Boolean.TRUE.equals(video.official())) {
            rank += 1;
        }
        return rank;
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

    private static SuggestionPage page(MovieListResponse response) {
        if (response == null || response.results() == null) {
            return new SuggestionPage(List.of(), 0);
        }
        return new SuggestionPage(suggestions(response), Math.min(response.totalPages(), MAX_PAGE));
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
                               Videos videos,
                               @JsonProperty("watch/providers") WatchProviders watchProviders) {
    }

    private record MovieExtras(List<String> providers, String trailerKey) {
    }

    private record CacheEntry(MovieExtras extras, long expiresAt) {
    }

    private record Videos(List<Video> results) {
    }

    private record Video(String key,
                         String site,
                         String type,
                         Boolean official,
                         @JsonProperty("iso_639_1") String language) {
    }

    private record WatchProviders(Map<String, CountryProviders> results) {
    }

    private record CountryProviders(List<Provider> flatrate) {
    }

    private record Provider(@JsonProperty("provider_name") String providerName) {
    }

    private record MovieListResponse(List<ListedMovie> results,
                                     @JsonProperty("total_pages") int totalPages) {
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

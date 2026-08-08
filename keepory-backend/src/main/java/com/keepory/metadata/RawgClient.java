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
import org.springframework.web.util.UriBuilder;

import java.net.URI;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.function.UnaryOperator;
import java.util.stream.Collectors;

/**
 * RAWG is the games catalog. Unlike TMDB it has no recommendations endpoint on
 * the free plan ({@code /games/{id}/suggested} is business-only), so affinity
 * rows are built from the genres of what is already on the shelf.
 */
@Component
public class RawgClient {

    public static final String SOURCE = "RAWG";

    private static final int SEARCH_RESULTS = 10;
    private static final int PAGE_SIZE = 20;
    // RAWG reports a total count, not a page count, and refuses deep pages well
    // before the count runs out; this is the ceiling fill() is allowed to walk.
    private static final int MAX_PAGE = 50;
    // Most added by players, RAWG's stand-in for TMDB's popularity ordering.
    private static final String POPULAR = "-added";
    // What the "new releases" row covers: a year back, so it is never empty in
    // a quiet quarter.
    private static final int LATEST_MONTHS = 12;

    private final RestClient client;
    private final String apiKey;
    // The genre catalog is static; fetched once per app run.
    private volatile Map<Integer, String> genres;

    public RawgClient(RestClient.Builder builder, @Value("${keepory.rawg.api-key}") String apiKey) {
        this.client = builder.baseUrl("https://api.rawg.io/api").build();
        this.apiKey = apiKey;
    }

    public List<MetadataSearchResult> search(String query) {
        GameListResponse response = get(uri -> withKey(uri.path("/games")
                .queryParam("search", query)
                .queryParam("page_size", SEARCH_RESULTS)
                // DLCs and season passes carry the base game's name and would
                // crowd out the game itself.
                .queryParam("exclude_additions", true))
                .build(), GameListResponse.class);
        if (response == null || response.results() == null) {
            return List.of();
        }
        return response.results().stream()
                .filter(g -> g.name() != null)
                // The listing carries no synopsis; only detail() has one.
                .map(g -> new MetadataSearchResult(SOURCE, String.valueOf(g.id()), g.name(),
                        year(g.released()), g.backgroundImage(), null))
                .toList();
    }

    public MetadataDetail detail(String externalId) {
        GameDetail game = get(uri -> withKey(uri.path("/games/{id}")).build(externalId), GameDetail.class);
        if (game == null || game.name() == null) {
            throw new MetadataProviderException("RAWG game %s not found".formatted(externalId));
        }

        Map<String, Object> attributes = new LinkedHashMap<>();
        put(attributes, "year", year(game.released()));
        putList(attributes, "platforms", platforms(game.platforms()));
        putList(attributes, "genres", names(game.genres()).stream().map(RawgClient::spanish).toList());
        put(attributes, "developer", joined(game.developers()));
        put(attributes, "publisher", joined(game.publishers()));
        put(attributes, "metacritic", game.metacritic());
        // RAWG counts an average playthrough in hours.
        put(attributes, "playtimeHours", game.playtime() == null || game.playtime() == 0 ? null : game.playtime());
        put(attributes, "esrb", game.esrbRating() == null ? null : game.esrbRating().name());

        return new MetadataDetail(SOURCE, externalId, game.name(), year(game.released()),
                game.backgroundImage(), attributes);
    }

    /** Released within the last year, most added first: the "what's new" row. */
    public SuggestionPage latest(int page) {
        LocalDate today = LocalDate.now();
        return discover(uri -> uri.queryParam("dates",
                "%s,%s".formatted(today.minusMonths(LATEST_MONTHS), today)), page, 0);
    }

    public SuggestionPage discoverByGenre(int genreId, int page, int metacriticFloor) {
        return discover(uri -> uri.queryParam("genres", genreId), page, metacriticFloor);
    }

    /** Everything released in the ten years starting at {@code startYear}. */
    public SuggestionPage discoverByDecade(int startYear, int page, int metacriticFloor) {
        return discover(uri -> uri.queryParam("dates",
                "%d-01-01,%d-12-31".formatted(startYear, startYear + 9)), page, metacriticFloor);
    }

    /** Stands in for the missing recommendations endpoint: more of the same genres. */
    public SuggestionPage discoverByGenres(List<Integer> genreIds, int page, int metacriticFloor) {
        String ids = genreIds.stream().map(String::valueOf).collect(Collectors.joining(","));
        return discover(uri -> uri.queryParam("genres", ids), page, metacriticFloor);
    }

    // Ordering by what players add surfaces the same catalog noise TMDB's
    // popularity does, so callers start with a Metacritic floor; a floor of 0
    // means they ran out of well-scored games and will take anything rather
    // than show an empty row.
    private SuggestionPage discover(UnaryOperator<UriBuilder> filter, int page, int metacriticFloor) {
        GameListResponse response = get(uri -> {
            UriBuilder builder = filter.apply(uri.path("/games"));
            if (metacriticFloor > 0) {
                builder = builder.queryParam("metacritic", metacriticFloor + ",100");
            }
            return withKey(builder
                    .queryParam("ordering", POPULAR)
                    .queryParam("exclude_additions", true)
                    .queryParam("page", page)
                    .queryParam("page_size", PAGE_SIZE))
                    .build();
        }, GameListResponse.class);
        if (response == null || response.results() == null) {
            return new SuggestionPage(List.of(), 0);
        }
        return new SuggestionPage(suggestions(response.results()), totalPages(response.count()));
    }

    /** Genre id to Spanish name, in the order RAWG ranks them by catalog size. */
    public Map<Integer, String> genreNamesById() {
        Map<Integer, String> cached = genres;
        if (cached != null) {
            return cached;
        }
        GenreListResponse response = get(uri -> withKey(uri.path("/genres")).build(), GenreListResponse.class);
        Map<Integer, String> loaded = response == null || response.results() == null ? Map.of()
                : response.results().stream()
                        .filter(g -> g.name() != null)
                        .collect(Collectors.toMap(Genre::id, g -> spanish(g.name()), (a, b) -> a,
                                LinkedHashMap::new));
        genres = loaded;
        return loaded;
    }

    /** The inverse: lowercased Spanish name to genre id, for seed matching. */
    public Map<String, Integer> genreIdsByName() {
        return genreNamesById().entrySet().stream()
                .collect(Collectors.toMap(e -> e.getValue().toLowerCase(Locale.ROOT), Map.Entry::getKey,
                        (a, b) -> a));
    }

    // RAWG has no localized catalog: genre names come back in English and the
    // chips are the one place they are read on their own, so they are mapped by
    // hand. Anything unmapped falls through under its English name.
    private static final Map<String, String> SPANISH_GENRES = Map.ofEntries(
            Map.entry("action", "Acción"),
            Map.entry("adventure", "Aventura"),
            Map.entry("role-playing games (rpg)", "RPG"),
            Map.entry("rpg", "RPG"),
            Map.entry("strategy", "Estrategia"),
            Map.entry("shooter", "Shooter"),
            Map.entry("casual", "Casual"),
            Map.entry("simulation", "Simulación"),
            Map.entry("puzzle", "Puzles"),
            Map.entry("arcade", "Arcade"),
            Map.entry("platformer", "Plataformas"),
            Map.entry("racing", "Carreras"),
            Map.entry("massively multiplayer", "Multijugador masivo"),
            Map.entry("sports", "Deportes"),
            Map.entry("fighting", "Lucha"),
            Map.entry("family", "Familiar"),
            Map.entry("board games", "Juegos de mesa"),
            Map.entry("educational", "Educativo"),
            Map.entry("card", "Cartas"),
            Map.entry("indie", "Indie"));

    private static String spanish(String name) {
        return SPANISH_GENRES.getOrDefault(name.toLowerCase(Locale.ROOT), name);
    }

    private static List<Suggestion> suggestions(List<ListedGame> games) {
        return games.stream()
                .filter(g -> g.name() != null)
                // A coverless card is a hole in the shelf, and RAWG entries
                // without artwork are thin catalog records anyway.
                .filter(g -> g.backgroundImage() != null)
                .map(g -> new Suggestion(SOURCE, String.valueOf(g.id()), g.name(),
                        year(g.released()), g.backgroundImage(), null, rating(g)))
                .toList();
    }

    // Metacritic is the score players recognise, but only a fraction of the
    // catalog has one; RAWG's own 0-5 rating scaled to 10 covers the rest.
    private static Double rating(ListedGame game) {
        if (game.metacritic() != null) {
            return game.metacritic() / 10.0;
        }
        return game.rating() == null || game.rating() == 0 ? null : game.rating() * 2;
    }

    private static int totalPages(Integer count) {
        if (count == null || count <= 0) {
            return 0;
        }
        return Math.min((count + PAGE_SIZE - 1) / PAGE_SIZE, MAX_PAGE);
    }

    private UriBuilder withKey(UriBuilder uri) {
        return uri.queryParam("key", apiKey);
    }

    private <T> T get(Function<UriBuilder, URI> uri, Class<T> type) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new MetadataProviderException("RAWG_API_KEY is not configured");
        }
        try {
            return client.get().uri(uri).retrieve().body(type);
        } catch (RestClientException ex) {
            throw new MetadataProviderException("RAWG request failed: " + ex.getMessage(), ex);
        }
    }

    private static List<String> platforms(List<PlatformEntry> entries) {
        if (entries == null) {
            return List.of();
        }
        return entries.stream()
                .map(PlatformEntry::platform)
                .filter(Objects::nonNull)
                .map(Platform::name)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
    }

    private static List<String> names(List<Named> named) {
        if (named == null) {
            return List.of();
        }
        return named.stream().map(Named::name).filter(Objects::nonNull).toList();
    }

    private static String joined(List<Named> named) {
        if (named == null || named.isEmpty()) {
            return null;
        }
        String joined = named.stream().map(Named::name).filter(Objects::nonNull)
                .collect(Collectors.joining(", "));
        return joined.isEmpty() ? null : joined;
    }

    private static Integer year(String released) {
        if (released == null || released.length() < 4) {
            return null;
        }
        try {
            return Integer.parseInt(released.substring(0, 4));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private static void put(Map<String, Object> map, String key, Object value) {
        if (value != null) {
            map.put(key, value);
        }
    }

    private static void putList(Map<String, Object> map, String key, List<String> values) {
        if (!values.isEmpty()) {
            map.put(key, values);
        }
    }

    private record GameListResponse(Integer count, List<ListedGame> results) {
    }

    private record ListedGame(long id,
                              String name,
                              String released,
                              @JsonProperty("background_image") String backgroundImage,
                              Double rating,
                              Integer metacritic) {
    }

    private record GameDetail(long id,
                              String name,
                              String released,
                              @JsonProperty("background_image") String backgroundImage,
                              Integer metacritic,
                              Integer playtime,
                              @JsonProperty("esrb_rating") Named esrbRating,
                              List<Named> genres,
                              List<Named> developers,
                              List<Named> publishers,
                              List<PlatformEntry> platforms) {
    }

    private record PlatformEntry(Platform platform) {
    }

    private record Platform(String name) {
    }

    private record Named(String name) {
    }

    private record GenreListResponse(List<Genre> results) {
    }

    private record Genre(int id, String name) {
    }
}

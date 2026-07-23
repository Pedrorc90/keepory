package com.keepory.suggestion;

import com.keepory.item.Item;
import com.keepory.item.ItemRepository;
import com.keepory.item.ItemStatus;
import com.keepory.item.ItemType;
import com.keepory.metadata.GoogleBooksClient;
import com.keepory.metadata.MetadataProviderException;
import com.keepory.metadata.TmdbClient;
import com.keepory.suggestion.dto.Suggestion;
import com.keepory.suggestion.dto.SuggestionDeck;
import org.springframework.stereotype.Service;

import java.text.Normalizer;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class SuggestionService {

    private static final int MAX_SEEDS = 5;
    private static final int SEEDS_PER_DECK = 3;
    private static final int MAX_GENRE_DECKS = 4;
    private static final int MAX_GENRE_PAGES = 3;
    private static final int MAX_DECKS = 6;
    private static final int DECK_SIZE = 15;
    private static final int MAX_RESULTS = 20;
    private static final int DISMISSAL_COOLDOWN_DAYS = 30;
    private static final String COMPLETED_TITLE = "Afines a tus vistas";
    private static final String PENDING_TITLE = "Afines a tus pendientes";
    // Statuses that reflect taste; they feed the genre profile.
    private static final Set<ItemStatus> TASTE_STATUSES = Set.of(ItemStatus.COMPLETED, ItemStatus.PENDING);

    private final ItemRepository items;
    private final SuggestionDismissalRepository dismissals;
    private final TmdbClient tmdb;
    private final GoogleBooksClient googleBooks;

    public SuggestionService(ItemRepository items, SuggestionDismissalRepository dismissals,
                             TmdbClient tmdb, GoogleBooksClient googleBooks) {
        this.items = items;
        this.dismissals = dismissals;
        this.tmdb = tmdb;
        this.googleBooks = googleBooks;
    }

    public List<SuggestionDeck> movieDecks() {
        List<Item> movies = items.findByTypeAndSourceAndDeletedAtIsNull(ItemType.MOVIE, TmdbClient.SOURCE);
        // Grows as decks fill so each movie is suggested in a single deck.
        Set<String> excluded = baseExclusions(movies);

        List<SuggestionDeck> decks = new ArrayList<>();
        addDeck(decks, excluded, "completed", COMPLETED_TITLE,
                statusDeck(movies, ItemStatus.COMPLETED, excluded));
        addDeck(decks, excluded, "pending", PENDING_TITLE,
                statusDeck(movies, ItemStatus.PENDING, excluded));
        for (TopGenre genre : topGenres(movies)) {
            if (decks.size() >= MAX_DECKS) {
                break;
            }
            addDeck(decks, excluded, "genre-" + genre.id(), genre.title(),
                    genreDeck(genre.id(), 1, excluded));
        }
        return decks;
    }

    // Rebuilds a single deck for the row refresh button. Unlike movieDecks(),
    // it cannot see what the other rows currently show, so cross-row repeats
    // are possible.
    public SuggestionDeck movieDeck(String deckId) {
        List<Item> movies = items.findByTypeAndSourceAndDeletedAtIsNull(ItemType.MOVIE, TmdbClient.SOURCE);
        Set<String> excluded = baseExclusions(movies);
        return switch (deckId) {
            case "completed" -> new SuggestionDeck(deckId, COMPLETED_TITLE,
                    statusDeck(movies, ItemStatus.COMPLETED, excluded));
            case "pending" -> new SuggestionDeck(deckId, PENDING_TITLE,
                    statusDeck(movies, ItemStatus.PENDING, excluded));
            default -> genreDeckById(deckId, excluded);
        };
    }

    private SuggestionDeck genreDeckById(String deckId, Set<String> excluded) {
        if (!deckId.startsWith("genre-")) {
            throw new IllegalArgumentException("Unknown deck id: " + deckId);
        }
        int genreId = Integer.parseInt(deckId.substring("genre-".length()));
        String name = tmdb.genreIdsByName().entrySet().stream()
                .filter(entry -> entry.getValue() == genreId)
                .map(Map.Entry::getKey)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown genre id: " + genreId));
        // Discover is deterministic; a random page window makes each refresh
        // surface new titles. Fall back to the top pages past the catalog end.
        int startPage = 2 + ThreadLocalRandom.current().nextInt(5);
        List<Suggestion> found = genreDeck(genreId, startPage, excluded);
        if (found.isEmpty()) {
            found = genreDeck(genreId, 1, excluded);
        }
        return new SuggestionDeck(deckId, capitalize(name), found);
    }

    private Set<String> baseExclusions(List<Item> movies) {
        Set<String> excluded = new HashSet<>(dismissed(TmdbClient.SOURCE));
        movies.stream().map(Item::getExternalId).filter(Objects::nonNull).forEach(excluded::add);
        return excluded;
    }

    private List<Suggestion> statusDeck(List<Item> movies, ItemStatus status, Set<String> excluded) {
        // Random subset of seeds so suggestions vary between visits.
        List<Item> seeds = new ArrayList<>(movies.stream()
                .filter(i -> i.getStatus() == status && i.getExternalId() != null)
                .toList());
        Collections.shuffle(seeds);

        Map<String, Suggestion> byId = new LinkedHashMap<>();
        Map<String, Integer> hits = new HashMap<>();
        for (Item seed : seeds.subList(0, Math.min(SEEDS_PER_DECK, seeds.size()))) {
            collect(tmdb.recommendations(seed.getExternalId()), byId, hits, excluded);
        }
        return top(byId, s -> hits.get(s.externalId()), DECK_SIZE);
    }

    // Genres share the same popular titles and earlier decks consume candidates,
    // so a single discover page often thins out; fetch more pages only as needed.
    private List<Suggestion> genreDeck(int genreId, int startPage, Set<String> excluded) {
        List<Suggestion> found = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        for (int page = startPage; page < startPage + MAX_GENRE_PAGES && found.size() < DECK_SIZE; page++) {
            List<Suggestion> results = tmdb.discoverByGenre(genreId, page);
            if (results.isEmpty()) {
                break;
            }
            for (Suggestion suggestion : results) {
                if (found.size() >= DECK_SIZE) {
                    break;
                }
                if (!excluded.contains(suggestion.externalId()) && ids.add(suggestion.externalId())) {
                    found.add(suggestion);
                }
            }
        }
        return found;
    }

    private List<TopGenre> topGenres(List<Item> movies) {
        Map<String, Integer> counts = new HashMap<>();
        for (Item movie : movies) {
            if (!TASTE_STATUSES.contains(movie.getStatus())) {
                continue;
            }
            for (String genre : strings(movie.getAttributes().get("genres"))) {
                counts.merge(genre.toLowerCase(Locale.ROOT), 1, Integer::sum);
            }
        }
        // Genre names are stored localized (es-ES), matching TMDB's localized catalog.
        Map<String, Integer> ids = tmdb.genreIdsByName();
        return counts.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .filter(entry -> ids.containsKey(entry.getKey()))
                .limit(MAX_GENRE_DECKS)
                .map(entry -> new TopGenre(ids.get(entry.getKey()), capitalize(entry.getKey())))
                .toList();
    }

    private static void addDeck(List<SuggestionDeck> decks, Set<String> excluded,
                                String id, String title, List<Suggestion> suggestions) {
        if (suggestions.isEmpty()) {
            return;
        }
        suggestions.forEach(s -> excluded.add(s.externalId()));
        decks.add(new SuggestionDeck(id, title, suggestions));
    }

    private record TopGenre(int id, String title) {
    }

    public List<Suggestion> books() {
        List<Item> books = items.findByTypeAndDeletedAtIsNull(ItemType.BOOK);
        Set<String> inCollection = books.stream()
                .filter(i -> GoogleBooksClient.SOURCE.equals(i.getSource()))
                .map(Item::getExternalId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        // Editions of an owned book carry different volume ids, so also exclude by title.
        Set<String> ownedTitles = books.stream()
                .map(i -> normalize(i.getTitle()))
                .collect(Collectors.toSet());
        Set<String> dismissed = dismissed(GoogleBooksClient.SOURCE);

        // Google Books has no recommendations endpoint: completed books seed
        // author/subject searches instead.
        List<Item> seeds = new ArrayList<>(books.stream()
                .filter(i -> i.getStatus() == ItemStatus.COMPLETED && !seedQueries(i).isEmpty())
                .toList());
        Collections.shuffle(seeds);

        // Keyed by normalized title so repeated editions collapse into one suggestion.
        Map<String, Suggestion> byTitle = new LinkedHashMap<>();
        Map<String, Integer> hits = new HashMap<>();
        int failedQueries = 0;
        for (Item seed : seeds.subList(0, Math.min(MAX_SEEDS, seeds.size()))) {
            for (String query : seedQueries(seed)) {
                List<Suggestion> found;
                try {
                    found = googleBooks.discover(query);
                } catch (MetadataProviderException ex) {
                    // Google Books still 503s ~2-3% of queries after retries; one bad
                    // query must not sink the whole deck.
                    failedQueries++;
                    continue;
                }
                for (Suggestion suggestion : found) {
                    String title = normalize(suggestion.title());
                    if (inCollection.contains(suggestion.externalId()) || dismissed.contains(suggestion.externalId())
                            || ownedTitles.contains(title)) {
                        continue;
                    }
                    byTitle.putIfAbsent(title, suggestion);
                    hits.merge(title, 1, Integer::sum);
                }
            }
        }
        if (byTitle.isEmpty() && failedQueries > 0) {
            throw new MetadataProviderException(
                    "Google Books discovery failed for all %d queries".formatted(failedQueries));
        }
        return top(byTitle, s -> hits.get(normalize(s.title())), MAX_RESULTS);
    }

    public void dismiss(String source, String externalId) {
        dismissals.save(new SuggestionDismissal(source, externalId));
    }

    private static void collect(List<Suggestion> found, Map<String, Suggestion> byId,
                                Map<String, Integer> hits, Set<String> excluded) {
        for (Suggestion suggestion : found) {
            if (excluded.contains(suggestion.externalId())) {
                continue;
            }
            byId.putIfAbsent(suggestion.externalId(), suggestion);
            hits.merge(suggestion.externalId(), 1, Integer::sum);
        }
    }

    private Set<String> dismissed(String source) {
        // Dismissals expire after a cooldown so discarded suggestions can resurface.
        OffsetDateTime cutoff = OffsetDateTime.now().minusDays(DISMISSAL_COOLDOWN_DAYS);
        return dismissals.findBySourceAndDismissedAtAfter(source, cutoff).stream()
                .map(SuggestionDismissal::getExternalId)
                .collect(Collectors.toSet());
    }

    private static List<Suggestion> top(Map<String, Suggestion> suggestions,
                                        Function<Suggestion, Integer> hits, int limit) {
        return suggestions.values().stream()
                .sorted(Comparator
                        .comparing(hits, Comparator.reverseOrder())
                        .thenComparing(s -> s.voteAverage() == null ? 0.0 : s.voteAverage(),
                                Comparator.reverseOrder()))
                .limit(limit)
                .toList();
    }

    private static String capitalize(String name) {
        return name.isEmpty() ? name : Character.toUpperCase(name.charAt(0)) + name.substring(1);
    }

    private static List<String> seedQueries(Item seed) {
        List<String> queries = new ArrayList<>(2);
        strings(seed.getAttributes().get("authors")).stream().findFirst()
                .ifPresent(author -> queries.add("inauthor:\"%s\"".formatted(author)));
        strings(seed.getAttributes().get("categories")).stream().findFirst()
                .map(SuggestionService::subject)
                .ifPresent(category -> queries.add("subject:\"%s\"".formatted(category)));
        return queries;
    }

    // BISAC-style categories ("Fiction / Fantasy / General") are too specific for
    // subject search; the middle segment is the useful genre term.
    private static String subject(String category) {
        String[] parts = category.split("/");
        for (int i = 1; i < parts.length; i++) {
            String part = parts[i].trim();
            if (!part.isEmpty() && !"General".equalsIgnoreCase(part)) {
                return part;
            }
        }
        return parts[0].trim();
    }

    // List attributes arrive as JSON arrays from metadata imports but as
    // comma-separated strings when edited by hand in the form.
    private static List<String> strings(Object value) {
        if (value instanceof List<?> list) {
            return list.stream().map(String::valueOf).map(String::trim).filter(s -> !s.isEmpty()).toList();
        }
        if (value instanceof String s) {
            return Arrays.stream(s.split(",")).map(String::trim).filter(v -> !v.isEmpty()).toList();
        }
        return List.of();
    }

    // Collapses editions of the same work: case, accents and punctuation are
    // ignored, and subtitles after ':' or '(' are dropped, as is the translated
    // half of bilingual titles ("El héroe de las eras / The Hero of Ages").
    private static String normalize(String title) {
        String base = title;
        for (String marker : new String[] {":", "(", " / "}) {
            int i = base.indexOf(marker);
            if (i > 0) {
                base = base.substring(0, i);
            }
        }
        return Normalizer.normalize(base, Normalizer.Form.NFD)
                .replaceAll("[\\p{M}\\p{Punct}]", "")
                .toLowerCase()
                .trim()
                .replaceAll("\\s+", " ");
    }
}

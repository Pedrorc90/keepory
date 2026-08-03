package com.keepory.suggestion;

import com.keepory.auth.CurrentUser;
import com.keepory.item.Item;
import com.keepory.item.ItemRepository;
import com.keepory.item.ItemStatus;
import com.keepory.item.ItemType;
import com.keepory.metadata.GoogleBooksClient;
import com.keepory.metadata.MetadataProviderException;
import com.keepory.metadata.TmdbClient;
import com.keepory.suggestion.dto.Suggestion;
import com.keepory.suggestion.dto.SuggestionDeck;
import com.keepory.suggestion.dto.SuggestionGenre;
import com.keepory.suggestion.dto.SuggestionPage;
import org.springframework.stereotype.Service;

import java.text.Normalizer;
import java.time.OffsetDateTime;
import java.time.Year;
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
    private static final int DECK_SIZE = 15;
    private static final int MAX_RESULTS = 20;
    private static final int DISMISSAL_COOLDOWN_DAYS = 30;
    // Requests a single deck may spend on TMDB before settling for what it has.
    private static final int MAX_REQUESTS = 8;
    // Tried in order: a deck that runs dry at one vote floor drops to the next
    // instead of coming back short. 0 means no floor at all, and every genre has
    // thousands of titles once the floor is gone.
    private static final int[] VOTE_FLOORS = {200, 50, 10, 0};
    // now_playing takes no vote filter, so relaxing it would just refetch page 1.
    private static final int[] NO_FLOORS = {0};
    private static final int OLDEST_DECADE = 1990;
    private static final String LATEST_DECK_ID = "latest";
    private static final String LATEST_TITLE = "Novedades en cartelera";
    private static final String COMPLETED_TITLE = "Afines a tus vistas";
    private static final String PENDING_TITLE = "Afines a tus pendientes";
    private static final String GENRE_PREFIX = "genre-";
    private static final String DECADE_PREFIX = "decade-";
    private static final String GENRE_GROUP = "Géneros";
    private static final String DECADE_GROUP = "Décadas";

    private final ItemRepository items;
    private final SuggestionDismissalRepository dismissals;
    private final TmdbClient tmdb;
    private final GoogleBooksClient googleBooks;
    private final CurrentUser currentUser;

    public SuggestionService(ItemRepository items, SuggestionDismissalRepository dismissals,
                             TmdbClient tmdb, GoogleBooksClient googleBooks, CurrentUser currentUser) {
        this.items = items;
        this.dismissals = dismissals;
        this.tmdb = tmdb;
        this.googleBooks = googleBooks;
        this.currentUser = currentUser;
    }

    public List<SuggestionDeck> movieDecks() {
        List<Item> movies = items.findByTypeAndSourceAndUserIdAndDeletedAtIsNull(
                ItemType.MOVIE, TmdbClient.SOURCE, currentUser.id());
        // Grows as decks fill so each movie is suggested in a single deck.
        Set<String> excluded = baseExclusions(movies);

        List<SuggestionDeck> decks = new ArrayList<>();
        // What is out right now leads: it is the only row that does not depend on
        // the shelf, so it has something to show even for an empty library.
        addDeck(decks, excluded, LATEST_DECK_ID, LATEST_TITLE,
                fill((page, floor) -> tmdb.nowPlaying(page), false, excluded, NO_FLOORS));
        addDeck(decks, excluded, "completed", COMPLETED_TITLE,
                statusDeck(movies, ItemStatus.COMPLETED, excluded));
        addDeck(decks, excluded, "pending", PENDING_TITLE,
                statusDeck(movies, ItemStatus.PENDING, excluded));
        // No genre rows here: genres are browsable from the chips instead.
        return enriched(decks);
    }

    // Providers and trailers cost one TMDB call per title, so they are fetched
    // for the final deck instead of every candidate fill() walked past.
    private SuggestionDeck enriched(SuggestionDeck deck) {
        return new SuggestionDeck(deck.id(), deck.title(), tmdb.enrich(deck.suggestions()));
    }

    // Every deck in a single burst rather than one per deck: enrich() fans out
    // over virtual threads, so 45 detail calls take the wall-clock of 15.
    private List<SuggestionDeck> enriched(List<SuggestionDeck> decks) {
        List<Suggestion> all = tmdb.enrich(decks.stream()
                .flatMap(deck -> deck.suggestions().stream())
                .toList());
        List<SuggestionDeck> result = new ArrayList<>(decks.size());
        int from = 0;
        for (SuggestionDeck deck : decks) {
            int to = from + deck.suggestions().size();
            result.add(new SuggestionDeck(deck.id(), deck.title(), List.copyOf(all.subList(from, to))));
            from = to;
        }
        return result;
    }

    /** Every chip the user can browse, in the order the UI stacks the rows. */
    public List<SuggestionGenre> movieGenres() {
        List<SuggestionGenre> facets = new ArrayList<>(genreFacets());
        facets.addAll(decadeFacets());
        return facets;
    }

    private List<SuggestionGenre> genreFacets() {
        return tmdb.genreIdsByName().entrySet().stream()
                .map(entry -> new SuggestionGenre(GENRE_PREFIX + entry.getValue(),
                        capitalize(entry.getKey()), GENRE_GROUP))
                .sorted(Comparator.comparing(SuggestionGenre::name))
                .toList();
    }

    private static List<SuggestionGenre> decadeFacets() {
        List<SuggestionGenre> decades = new ArrayList<>();
        for (int year = (Year.now().getValue() / 10) * 10; year >= OLDEST_DECADE; year -= 10) {
            decades.add(new SuggestionGenre(DECADE_PREFIX + year, decadeName(year), DECADE_GROUP));
        }
        return decades;
    }

    // "Años 90" reads better than "Años 1990"; from 2000 on the full year wins.
    private static String decadeName(int startYear) {
        return startYear >= 2000 ? "Años " + startYear : "Años " + (startYear % 100);
    }

    // Builds a single deck: on first open ({@code refresh} false) it serves the
    // most popular titles, and the row's refresh button asks for a further page.
    // Unlike movieDecks(), it cannot see what the other rows currently show, so
    // cross-row repeats are possible.
    public SuggestionDeck movieDeck(String deckId, boolean refresh) {
        List<Item> movies = items.findByTypeAndSourceAndUserIdAndDeletedAtIsNull(
                ItemType.MOVIE, TmdbClient.SOURCE, currentUser.id());
        Set<String> excluded = baseExclusions(movies);
        return enriched(switch (deckId) {
            case LATEST_DECK_ID -> new SuggestionDeck(deckId, LATEST_TITLE,
                    fill((page, floor) -> tmdb.nowPlaying(page), refresh, excluded, NO_FLOORS));
            case "completed" -> new SuggestionDeck(deckId, COMPLETED_TITLE,
                    statusDeck(movies, ItemStatus.COMPLETED, excluded));
            case "pending" -> new SuggestionDeck(deckId, PENDING_TITLE,
                    statusDeck(movies, ItemStatus.PENDING, excluded));
            default -> browsableDeck(deckId, refresh, excluded);
        });
    }

    private SuggestionDeck browsableDeck(String deckId, boolean refresh, Set<String> excluded) {
        if (deckId.startsWith(GENRE_PREFIX)) {
            int genreId = idIn(deckId, GENRE_PREFIX);
            return new SuggestionDeck(deckId, capitalize(genreName(genreId)),
                    fill((page, floor) -> tmdb.discoverByGenre(genreId, page, floor),
                            refresh, excluded, VOTE_FLOORS));
        }
        if (deckId.startsWith(DECADE_PREFIX)) {
            int startYear = idIn(deckId, DECADE_PREFIX);
            return new SuggestionDeck(deckId, decadeName(startYear),
                    fill((page, floor) -> tmdb.discoverByDecade(startYear, page, floor),
                            refresh, excluded, VOTE_FLOORS));
        }
        throw new IllegalArgumentException("Unknown deck id: " + deckId);
    }

    private static int idIn(String deckId, String prefix) {
        try {
            return Integer.parseInt(deckId.substring(prefix.length()));
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("Unknown deck id: " + deckId, ex);
        }
    }

    private String genreName(int genreId) {
        return tmdb.genreIdsByName().entrySet().stream()
                .filter(entry -> entry.getValue() == genreId)
                .map(Map.Entry::getKey)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown genre id: " + genreId));
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

    // What TMDB recommends for one title, for the row under its edit form. The
    // seed itself is already on the shelf, so baseExclusions keeps it out.
    public List<Suggestion> similarMovies(String externalId) {
        List<Item> movies = items.findByTypeAndSourceAndUserIdAndDeletedAtIsNull(
                ItemType.MOVIE, TmdbClient.SOURCE, currentUser.id());
        Map<String, Suggestion> byId = new LinkedHashMap<>();
        Map<String, Integer> hits = new HashMap<>();
        collect(tmdb.recommendations(externalId), byId, hits, baseExclusions(movies));
        return tmdb.enrich(top(byId, s -> hits.get(s.externalId()), DECK_SIZE));
    }

    @FunctionalInterface
    private interface PageFetcher {
        SuggestionPage fetch(int page, int voteFloor);
    }

    // A deck should not come back empty. Earlier decks and the shelf itself eat
    // the popular pages, so this walks every page the query really has — wrapping
    // around from a random start when refreshing — and only then drops to a lower
    // vote floor. Bounded by MAX_REQUESTS so a niche chip cannot stall the page.
    private List<Suggestion> fill(PageFetcher fetcher, boolean refresh, Set<String> excluded,
                                  int[] voteFloors) {
        List<Suggestion> found = new ArrayList<>();
        Set<String> ids = new HashSet<>();
        int requests = 0;
        for (int voteFloor : voteFloors) {
            SuggestionPage first = fetcher.fetch(1, voteFloor);
            requests++;
            int totalPages = first.totalPages();
            if (totalPages < 1) {
                continue;
            }
            int start = refresh ? 1 + ThreadLocalRandom.current().nextInt(totalPages) : 1;
            for (int i = 0; i < totalPages && found.size() < DECK_SIZE && requests <= MAX_REQUESTS; i++) {
                int page = 1 + ((start - 1 + i) % totalPages);
                List<Suggestion> results;
                if (page == 1) {
                    results = first.results();
                } else {
                    results = fetcher.fetch(page, voteFloor).results();
                    requests++;
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
            if (found.size() >= DECK_SIZE || requests > MAX_REQUESTS) {
                break;
            }
        }
        return found;
    }

    private static void addDeck(List<SuggestionDeck> decks, Set<String> excluded,
                                String id, String title, List<Suggestion> suggestions) {
        if (suggestions.isEmpty()) {
            return;
        }
        suggestions.forEach(s -> excluded.add(s.externalId()));
        decks.add(new SuggestionDeck(id, title, suggestions));
    }

    public List<Suggestion> books() {
        List<Item> books = items.findByTypeAndUserIdAndDeletedAtIsNull(ItemType.BOOK, currentUser.id());
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
        dismissals.save(new SuggestionDismissal(currentUser.id(), source, externalId));
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
        return dismissals.findByUserIdAndSourceAndDismissedAtAfter(currentUser.id(), source, cutoff).stream()
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

    // Google Books indexes Spanish editions under Spanish subject terms, so the
    // English BISAC label barely matches once langRestrict=es is on: measured over
    // 20 results, subject:"Fantasy" leaves 1 Spanish title and subject:"Fantasia"
    // leaves 14. Only terms measured to beat their English label are mapped —
    // "Thrillers" (5 vs 2) and "Classics" (10 vs 1) still do better in English, and
    // "Fantasia" goes unaccented because "Fantasía" is barely indexed (1 result).
    private static final Map<String, String> SPANISH_SUBJECTS = Map.ofEntries(
            Map.entry("fantasy", "Fantasia"),
            Map.entry("mystery & detective", "Novela negra"),
            Map.entry("action & adventure", "Aventuras"),
            Map.entry("science fiction", "Ciencia ficción"),
            Map.entry("historical", "Novela histórica"),
            Map.entry("social themes", "Novela juvenil"),
            Map.entry("school & education", "Novela juvenil"),
            Map.entry("family", "Familia"),
            Map.entry("romance", "Novela romántica"),
            Map.entry("horror", "Terror"),
            Map.entry("biography & autobiography", "Biografía"),
            Map.entry("literary", "Narrativa"),
            Map.entry("poetry", "Poesía"));

    // BISAC-style categories ("Fiction / Fantasy / General") are too specific for
    // subject search; the middle segment is the useful genre term.
    private static String subject(String category) {
        String term = bisacTerm(category);
        return SPANISH_SUBJECTS.getOrDefault(term.toLowerCase(Locale.ROOT), term);
    }

    private static String bisacTerm(String category) {
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

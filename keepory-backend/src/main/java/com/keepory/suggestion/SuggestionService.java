package com.keepory.suggestion;

import com.keepory.item.Item;
import com.keepory.item.ItemRepository;
import com.keepory.item.ItemStatus;
import com.keepory.item.ItemType;
import com.keepory.metadata.TmdbClient;
import com.keepory.suggestion.dto.MovieSuggestion;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class SuggestionService {

    private static final int MAX_SEEDS = 5;
    private static final int MAX_RESULTS = 20;

    private final ItemRepository items;
    private final SuggestionDismissalRepository dismissals;
    private final TmdbClient tmdb;

    public SuggestionService(ItemRepository items, SuggestionDismissalRepository dismissals, TmdbClient tmdb) {
        this.items = items;
        this.dismissals = dismissals;
        this.tmdb = tmdb;
    }

    public List<MovieSuggestion> movies() {
        List<Item> movies = items.findByTypeAndSourceAndDeletedAtIsNull(ItemType.MOVIE, TmdbClient.SOURCE);
        Set<String> inCollection = movies.stream()
                .map(Item::getExternalId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Set<String> dismissed = dismissals.findBySource(TmdbClient.SOURCE).stream()
                .map(SuggestionDismissal::getExternalId)
                .collect(Collectors.toSet());

        // Random subset of completed movies as seeds so suggestions vary between visits.
        List<Item> seeds = new ArrayList<>(movies.stream()
                .filter(i -> i.getStatus() == ItemStatus.COMPLETED && i.getExternalId() != null)
                .toList());
        Collections.shuffle(seeds);

        Map<String, MovieSuggestion> byId = new LinkedHashMap<>();
        Map<String, Integer> hits = new HashMap<>();
        for (Item seed : seeds.subList(0, Math.min(MAX_SEEDS, seeds.size()))) {
            for (MovieSuggestion suggestion : tmdb.recommendations(seed.getExternalId())) {
                if (inCollection.contains(suggestion.externalId()) || dismissed.contains(suggestion.externalId())) {
                    continue;
                }
                byId.putIfAbsent(suggestion.externalId(), suggestion);
                hits.merge(suggestion.externalId(), 1, Integer::sum);
            }
        }
        return byId.values().stream()
                .sorted(Comparator
                        .comparing((MovieSuggestion s) -> hits.get(s.externalId()), Comparator.reverseOrder())
                        .thenComparing(s -> s.voteAverage() == null ? 0.0 : s.voteAverage(),
                                Comparator.reverseOrder()))
                .limit(MAX_RESULTS)
                .toList();
    }

    public void dismiss(String source, String externalId) {
        dismissals.save(new SuggestionDismissal(source, externalId));
    }
}

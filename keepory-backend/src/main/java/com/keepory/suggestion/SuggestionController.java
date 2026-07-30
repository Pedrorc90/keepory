package com.keepory.suggestion;

import com.keepory.suggestion.dto.Suggestion;
import com.keepory.suggestion.dto.SuggestionDeck;
import com.keepory.suggestion.dto.SuggestionGenre;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/suggestions")
public class SuggestionController {

    private final SuggestionService service;

    public SuggestionController(SuggestionService service) {
        this.service = service;
    }

    @GetMapping("/movies")
    public List<SuggestionDeck> movies() {
        return service.movieDecks();
    }

    @GetMapping("/movies/genres")
    public List<SuggestionGenre> movieGenres() {
        return service.movieGenres();
    }

    @GetMapping("/movies/{deckId}")
    public SuggestionDeck movieDeck(@PathVariable String deckId,
                                    @RequestParam(defaultValue = "false") boolean refresh) {
        return service.movieDeck(deckId, refresh);
    }

    @GetMapping("/books")
    public List<Suggestion> books() {
        return service.books();
    }

    @PostMapping("/dismiss")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void dismiss(@RequestBody DismissRequest request) {
        service.dismiss(request.source(), request.externalId());
    }

    public record DismissRequest(String source, String externalId) {
    }
}

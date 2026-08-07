import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface Suggestion {
  source: string;
  externalId: string;
  title: string;
  year: number | null;
  coverUrl: string | null;
  overview: string | null;
  voteAverage: number | null;
  /** Streaming services with a flat-rate offer in Spain. */
  providers: string[];
  /** YouTube key of the trailer, null when the title has none. */
  trailerKey: string | null;
}

export function trailerUrl(suggestion: Suggestion): string {
  return `https://www.youtube.com/watch?v=${suggestion.trailerKey}`;
}

export interface SuggestionDeck {
  id: string;
  title: string;
  suggestions: Suggestion[];
}

export interface SuggestionGenre {
  deckId: string;
  name: string;
  /** Row the chip belongs to: género, década o director. */
  group: string;
}

@Injectable({ providedIn: 'root' })
export class SuggestionApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/suggestions';

  movieDecks(): Observable<SuggestionDeck[]> {
    return this.http.get<SuggestionDeck[]>(`${this.baseUrl}/movies`);
  }

  movieGenres(): Observable<SuggestionGenre[]> {
    return this.http.get<SuggestionGenre[]>(`${this.baseUrl}/movies/genres`);
  }

  /** `refresh` asks for a further page instead of the genre's most popular. */
  movieDeck(id: string, refresh = false): Observable<SuggestionDeck> {
    return this.http.get<SuggestionDeck>(`${this.baseUrl}/movies/${id}`, {
      params: refresh ? { refresh: true } : {},
    });
  }

  /** What TMDB recommends for one movie, shown while editing it. */
  similarMovies(externalId: string): Observable<Suggestion[]> {
    return this.http.get<Suggestion[]>(`${this.baseUrl}/movies/similar/${externalId}`);
  }

  books(): Observable<Suggestion[]> {
    return this.http.get<Suggestion[]>(`${this.baseUrl}/books`);
  }

  bookGenres(): Observable<SuggestionGenre[]> {
    return this.http.get<SuggestionGenre[]>(`${this.baseUrl}/books/genres`);
  }

  /** One genre shelf; unlike movies it takes no refresh, Google Books has one page. */
  bookDeck(id: string): Observable<SuggestionDeck> {
    return this.http.get<SuggestionDeck>(`${this.baseUrl}/books/${id}`);
  }

  dismiss(suggestion: Suggestion): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/dismiss`, {
      source: suggestion.source,
      externalId: suggestion.externalId,
    });
  }
}

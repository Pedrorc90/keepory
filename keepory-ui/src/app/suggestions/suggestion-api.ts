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
}

export interface SuggestionDeck {
  id: string;
  title: string;
  suggestions: Suggestion[];
}

@Injectable({ providedIn: 'root' })
export class SuggestionApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/suggestions';

  movieDecks(): Observable<SuggestionDeck[]> {
    return this.http.get<SuggestionDeck[]>(`${this.baseUrl}/movies`);
  }

  movieDeck(id: string): Observable<SuggestionDeck> {
    return this.http.get<SuggestionDeck>(`${this.baseUrl}/movies/${id}`);
  }

  books(): Observable<Suggestion[]> {
    return this.http.get<Suggestion[]>(`${this.baseUrl}/books`);
  }

  dismiss(suggestion: Suggestion): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/dismiss`, {
      source: suggestion.source,
      externalId: suggestion.externalId,
    });
  }
}

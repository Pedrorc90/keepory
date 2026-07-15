import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface MovieSuggestion {
  source: string;
  externalId: string;
  title: string;
  year: number | null;
  coverUrl: string | null;
  overview: string | null;
  voteAverage: number | null;
}

@Injectable({ providedIn: 'root' })
export class SuggestionApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/suggestions';

  movies(): Observable<MovieSuggestion[]> {
    return this.http.get<MovieSuggestion[]>(`${this.baseUrl}/movies`);
  }

  dismiss(suggestion: MovieSuggestion): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/dismiss`, {
      source: suggestion.source,
      externalId: suggestion.externalId,
    });
  }
}

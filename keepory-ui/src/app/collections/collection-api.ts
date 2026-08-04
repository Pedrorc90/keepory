import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AuthApi } from '../auth/auth-api';
import { ItemType } from '../items/item.model';

export interface Collection {
  id: string;
  name: string;
  /** Every collection lives under one type: it is how the sidebar groups them. */
  type: ItemType;
  itemCount: number;
  /** Up to four covers, newest first: the mosaic on the collection card. */
  covers: string[];
}

@Injectable({ providedIn: 'root' })
export class CollectionApi {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthApi);
  private readonly baseUrl = '/api/collections';

  // Single cached list: the sidebar, the list picker and the form all read from it.
  private readonly state = signal<Collection[]>([]);
  readonly all = this.state.asReadonly();

  constructor() {
    // The sidebar belongs to whoever is logged in: load on login, empty on logout.
    // Fetching in the constructor instead would 401 before anyone has signed in.
    effect(() => {
      if (this.auth.user()) this.refresh();
      else this.state.set([]);
    });
  }

  refresh(): void {
    this.http.get<Collection[]>(this.baseUrl).subscribe({
      next: (collections) => this.state.set(collections),
      error: () => this.state.set([]),
    });
  }

  forType(type: ItemType | '' | null): Collection[] {
    return this.state().filter((c) => !type || c.type === type);
  }

  byId(id: string): Collection | undefined {
    return this.state().find((c) => c.id === id);
  }

  create(name: string, type: ItemType): Observable<Collection> {
    return this.http.post<Collection>(this.baseUrl, { name, type }).pipe(tap(() => this.refresh()));
  }

  rename(id: string, name: string): Observable<Collection> {
    return this.http
      .put<Collection>(`${this.baseUrl}/${id}`, { name })
      .pipe(tap(() => this.refresh()));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`).pipe(tap(() => this.refresh()));
  }

  addItem(collectionId: string, itemId: string): Observable<void> {
    return this.http
      .put<void>(`${this.baseUrl}/${collectionId}/items/${itemId}`, {})
      .pipe(tap(() => this.refresh()));
  }

  removeItem(collectionId: string, itemId: string): Observable<void> {
    return this.http
      .delete<void>(`${this.baseUrl}/${collectionId}/items/${itemId}`)
      .pipe(tap(() => this.refresh()));
  }

  ofItem(itemId: string): Observable<string[]> {
    return this.http.get<string[]>(`/api/items/${itemId}/collections`);
  }

  setForItem(itemId: string, collectionIds: string[]): Observable<void> {
    return this.http
      .put<void>(`/api/items/${itemId}/collections`, collectionIds)
      .pipe(tap(() => this.refresh()));
  }
}

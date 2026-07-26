import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ItemType } from '../items/item.model';

export interface Collection {
  id: string;
  name: string;
  /** Null means the collection accepts any item type. */
  type: ItemType | null;
  itemCount: number;
}

@Injectable({ providedIn: 'root' })
export class CollectionApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/collections';

  // Single cached list: the sidebar, the list picker and the form all read from it.
  private readonly state = signal<Collection[]>([]);
  readonly all = this.state.asReadonly();

  constructor() {
    this.refresh();
  }

  refresh(): void {
    this.http.get<Collection[]>(this.baseUrl).subscribe({
      next: (collections) => this.state.set(collections),
      error: () => this.state.set([]),
    });
  }

  forType(type: ItemType | '' | null): Collection[] {
    return this.state().filter((c) => !type || c.type === null || c.type === type);
  }

  byId(id: string): Collection | undefined {
    return this.state().find((c) => c.id === id);
  }

  create(name: string, type: ItemType | null): Observable<Collection> {
    return this.http.post<Collection>(this.baseUrl, { name, type }).pipe(tap(() => this.refresh()));
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

import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Item, ItemRequest, ItemStatus, ItemType, Page } from './item.model';

export type ItemSort = 'recent' | 'title' | 'genre';

export interface ItemFilters {
  type?: ItemType | null;
  status?: ItemStatus | null;
  q?: string | null;
  sort?: ItemSort;
  page?: number;
  size?: number;
}

@Injectable({ providedIn: 'root' })
export class ItemApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/items';

  list(filters: ItemFilters = {}): Observable<Page<Item>> {
    let params = new HttpParams()
      .set('page', filters.page ?? 0)
      .set('size', filters.size ?? 35);
    if (filters.type) params = params.set('type', filters.type);
    if (filters.status) params = params.set('status', filters.status);
    if (filters.q) params = params.set('q', filters.q);
    if (filters.sort && filters.sort !== 'recent') params = params.set('sortBy', filters.sort);
    return this.http.get<Page<Item>>(this.baseUrl, { params });
  }

  get(id: string): Observable<Item> {
    return this.http.get<Item>(`${this.baseUrl}/${id}`);
  }

  create(request: ItemRequest): Observable<Item> {
    return this.http.post<Item>(this.baseUrl, request);
  }

  update(id: string, request: ItemRequest): Observable<Item> {
    return this.http.put<Item>(`${this.baseUrl}/${id}`, request);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}

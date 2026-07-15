import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ItemType } from './item.model';
import { MetadataDetail, MetadataSearchResult } from './metadata.model';

@Injectable({ providedIn: 'root' })
export class MetadataApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/metadata';

  search(type: ItemType, q: string): Observable<MetadataSearchResult[]> {
    const params = new HttpParams().set('type', type).set('q', q);
    return this.http.get<MetadataSearchResult[]>(`${this.baseUrl}/search`, { params });
  }

  detail(type: ItemType, externalId: string): Observable<MetadataDetail> {
    const params = new HttpParams().set('type', type).set('externalId', externalId);
    return this.http.get<MetadataDetail>(`${this.baseUrl}/detail`, { params });
  }
}

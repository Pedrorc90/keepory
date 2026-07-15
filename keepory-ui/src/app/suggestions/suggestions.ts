import { Component, computed, inject, signal } from '@angular/core';
import { switchMap } from 'rxjs';
import { ItemApi } from '../items/item-api';
import { ItemStatus } from '../items/item.model';
import { MetadataApi } from '../items/metadata-api';
import { MovieSuggestion, SuggestionApi } from './suggestion-api';

@Component({
  selector: 'app-suggestions',
  template: `
    <div class="mx-auto max-w-sm">
      <h1 class="text-center font-display text-3xl font-semibold">Sugerencias</h1>
      <p class="mt-1 text-center text-sm text-muted">Películas afines a lo que ya has visto.</p>

      @if (loading()) {
        <p class="mt-12 text-center text-sm text-muted">Buscando sugerencias…</p>
      } @else if (loadError()) {
        <div class="mt-12 text-center">
          <p class="rounded-md border border-rust/50 bg-rust/10 px-4 py-3 text-sm">{{ loadError() }}</p>
          <button type="button" (click)="load()" class="mt-4 text-sm underline">Reintentar</button>
        </div>
      } @else if (current(); as s) {
        <article class="mt-6">
          <div class="mx-auto aspect-2/3 w-56 overflow-hidden rounded-lg bg-panel ring-1 ring-line shadow-lg">
            @if (s.coverUrl) {
              <img [src]="s.coverUrl" [alt]="s.title" class="h-full w-full object-cover" />
            } @else {
              <div class="flex h-full items-center justify-center p-4 text-center text-xs text-muted">
                Sin carátula
              </div>
            }
          </div>

          <div class="mt-4 text-center">
            <h2 class="font-display text-xl font-semibold">{{ s.title }}</h2>
            <p class="mt-1 text-sm text-muted">
              @if (s.year) { {{ s.year }} }
              @if (s.voteAverage) { · ★ {{ s.voteAverage.toFixed(1) }} }
            </p>
            @if (s.overview) {
              <p class="mt-2 line-clamp-4 text-sm text-muted">{{ s.overview }}</p>
            }
          </div>

          @if (actionError()) {
            <p class="mt-4 rounded-md border border-rust/50 bg-rust/10 px-4 py-2 text-center text-sm">
              {{ actionError() }}
            </p>
          }

          <div class="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              (click)="discard(s)"
              [disabled]="busy()"
              class="rounded-md border border-line px-4 py-2 text-sm text-muted transition enabled:hover:border-rust enabled:hover:text-rust disabled:opacity-60"
            >
              Descartar
            </button>
            <button
              type="button"
              (click)="add(s, 'PENDING')"
              [disabled]="busy()"
              class="rounded-md border border-amber px-4 py-2 text-sm text-amber transition enabled:hover:bg-amber enabled:hover:text-ink disabled:opacity-60"
            >
              Pendiente
            </button>
            <button
              type="button"
              (click)="add(s, 'COMPLETED')"
              [disabled]="busy()"
              class="rounded-md bg-moss px-4 py-2 text-sm font-medium text-ink transition enabled:hover:brightness-110 disabled:opacity-60"
            >
              Ya la he visto
            </button>
          </div>

          <p class="mt-4 text-center text-xs text-muted">{{ remaining() }} sugerencias en la baraja</p>
        </article>
      } @else {
        <div class="mt-12 text-center text-sm text-muted">
          <p>No hay más sugerencias por ahora.</p>
          <p class="mt-1">Marca películas como completadas para afinar la baraja.</p>
          <button type="button" (click)="load()" class="mt-4 text-sm text-amber underline">
            Buscar de nuevo
          </button>
        </div>
      }
    </div>
  `,
})
export class Suggestions {
  private readonly suggestionApi = inject(SuggestionApi);
  private readonly metadataApi = inject(MetadataApi);
  private readonly itemApi = inject(ItemApi);

  readonly suggestions = signal<MovieSuggestion[]>([]);
  readonly index = signal(0);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  readonly current = computed(() => this.suggestions()[this.index()] ?? null);
  readonly remaining = computed(() => this.suggestions().length - this.index());

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.index.set(0);
    this.suggestionApi.movies().subscribe({
      next: (suggestions) => {
        this.suggestions.set(suggestions);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('No se pudieron cargar las sugerencias. ¿Está configurada la key de TMDB?');
        this.loading.set(false);
      },
    });
  }

  add(suggestion: MovieSuggestion, status: ItemStatus): void {
    this.busy.set(true);
    this.actionError.set(null);
    this.metadataApi
      .detail('MOVIE', suggestion.externalId)
      .pipe(
        switchMap((detail) =>
          this.itemApi.create({
            id: crypto.randomUUID(),
            type: 'MOVIE',
            title: detail.title,
            coverUrl: detail.coverUrl,
            status,
            rating: null,
            completedAt: null,
            notes: null,
            attributes: detail.attributes ?? {},
            source: detail.source,
            externalId: detail.externalId,
          }),
        ),
      )
      .subscribe({
        next: () => this.advance(),
        error: () => {
          this.actionError.set('No se pudo añadir a la colección.');
          this.busy.set(false);
        },
      });
  }

  discard(suggestion: MovieSuggestion): void {
    this.busy.set(true);
    this.actionError.set(null);
    this.suggestionApi.dismiss(suggestion).subscribe({
      next: () => this.advance(),
      error: () => {
        this.actionError.set('No se pudo descartar la sugerencia.');
        this.busy.set(false);
      },
    });
  }

  private advance(): void {
    this.index.update((i) => i + 1);
    this.busy.set(false);
  }
}

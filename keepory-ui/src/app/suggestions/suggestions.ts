import { Component, computed, inject, signal } from '@angular/core';
import { map } from 'rxjs';
import { ItemType } from '../items/item.model';
import { Suggestion, SuggestionApi, SuggestionDeck } from './suggestion-api';
import { SuggestionRow } from './suggestion-row';

interface SuggestionTexts {
  tagline: string;
  completed: string;
  duplicate: string;
  emptyHint: string;
  loadError: string;
}

@Component({
  selector: 'app-suggestions',
  imports: [SuggestionRow],
  template: `
    <div>
      <h1 class="text-center font-display text-3xl font-semibold">Sugerencias</h1>
      <p class="mt-1 text-center text-sm text-muted">{{ labels().tagline }}</p>

      <div class="mt-4 flex justify-center gap-2">
        @for (t of types; track t) {
          <button
            type="button"
            (click)="setType(t)"
            [class]="
              type() === t
                ? 'rounded-full border border-amber bg-amber/15 px-4 py-1.5 text-sm text-paper'
                : 'rounded-full border border-line px-4 py-1.5 text-sm text-muted transition hover:border-amber/60 hover:text-paper'
            "
          >
            {{ typeTabs[t] }}
          </button>
        }
      </div>

      @if (loading()) {
        <p class="mt-12 text-center text-sm text-muted">Buscando sugerencias…</p>
      } @else if (loadError()) {
        <div class="mt-12 text-center">
          <p class="rounded-md border border-rust/50 bg-rust/10 px-4 py-3 text-sm">{{ loadError() }}</p>
          <button type="button" (click)="load()" class="mt-4 text-sm underline">Reintentar</button>
        </div>
      } @else if (sections().length) {
        @if (refreshError()) {
          <p class="mx-auto mt-4 w-fit rounded-md border border-rust/50 bg-rust/10 px-4 py-2 text-sm">
            {{ refreshError() }}
          </p>
        }
        <div class="mx-auto mt-8 space-y-8 sm:w-fit">
          @for (section of sections(); track section.id) {
            <section>
              <div class="flex items-center gap-2">
                <h2 class="font-display text-lg font-semibold text-amber">{{ section.title }}</h2>
                <button
                  type="button"
                  (click)="refreshSection(section.id)"
                  [disabled]="refreshingId() !== null"
                  title="Refrescar fila"
                  aria-label="Refrescar fila"
                  class="text-lg leading-none text-muted transition enabled:hover:text-amber disabled:opacity-50"
                  [class.animate-spin]="refreshingId() === section.id"
                >
                  ↻
                </button>
              </div>
              <app-suggestion-row
                class="mt-3 block"
                [suggestions]="section.suggestions"
                [type]="type()"
                [completedLabel]="labels().completed"
                [duplicateMessage]="labels().duplicate"
                (reload)="refreshSection(section.id)"
              />
            </section>
          }
        </div>
      } @else {
        <div class="mt-12 text-center text-sm text-muted">
          <p>No hay más sugerencias por ahora.</p>
          <p class="mt-1">{{ labels().emptyHint }}</p>
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

  readonly types: ItemType[] = ['MOVIE', 'BOOK'];
  readonly typeTabs: Record<ItemType, string> = { MOVIE: 'Películas', BOOK: 'Libros' };
  private readonly texts: Record<ItemType, SuggestionTexts> = {
    MOVIE: {
      tagline: 'Filas según lo que has visto, tus pendientes y tus géneros favoritos.',
      completed: 'Vista',
      duplicate: 'Esta película ya está en tu colección.',
      emptyHint: 'Añade películas completadas o pendientes para afinar las sugerencias.',
      loadError: 'No se pudieron cargar las sugerencias. ¿Está configurada la key de TMDB?',
    },
    BOOK: {
      tagline: 'Libros afines a lo que ya has leído.',
      completed: 'Leído',
      duplicate: 'Este libro ya está en tu colección.',
      emptyHint: 'Marca libros como completados para afinar las sugerencias.',
      loadError: 'No se pudieron cargar las sugerencias. ¿Está configurada la key de Google Books?',
    },
  };

  readonly type = signal<ItemType>('MOVIE');
  readonly labels = computed(() => this.texts[this.type()]);
  readonly sections = signal<SuggestionDeck[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly refreshingId = signal<string | null>(null);
  readonly refreshError = signal<string | null>(null);

  constructor() {
    this.load();
  }

  setType(type: ItemType): void {
    if (this.type() === type) {
      return;
    }
    this.type.set(type);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.refreshError.set(null);
    const sections$ =
      this.type() === 'MOVIE'
        ? this.suggestionApi.movieDecks()
        : this.suggestionApi.books().pipe(
            map((suggestions): SuggestionDeck[] =>
              suggestions.length ? [this.bookSection(suggestions)] : [],
            ),
          );
    sections$.subscribe({
      next: (sections) => {
        this.sections.set(sections);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(this.labels().loadError);
        this.loading.set(false);
      },
    });
  }

  refreshSection(id: string): void {
    if (this.refreshingId() !== null) {
      return;
    }
    this.refreshingId.set(id);
    this.refreshError.set(null);
    const deck$ =
      this.type() === 'MOVIE'
        ? this.suggestionApi.movieDeck(id)
        : this.suggestionApi.books().pipe(map((suggestions) => this.bookSection(suggestions)));
    deck$.subscribe({
      next: (deck) => {
        this.sections.update((sections) => sections.map((s) => (s.id === id ? deck : s)));
        this.refreshingId.set(null);
      },
      error: () => {
        this.refreshError.set('No se pudo refrescar la fila.');
        this.refreshingId.set(null);
      },
    });
  }

  private bookSection(suggestions: Suggestion[]): SuggestionDeck {
    return { id: 'books', title: 'Afines a tus lecturas', suggestions };
  }
}

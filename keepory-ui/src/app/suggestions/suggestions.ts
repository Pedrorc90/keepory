import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, map } from 'rxjs';
import { ItemType } from '../items/item.model';
import { Suggestion, SuggestionApi, SuggestionDeck, SuggestionGenre } from './suggestion-api';
import { SuggestionDeckView } from './suggestion-deck';
import { SuggestionRow } from './suggestion-row';

/** Below this width the suggestions become a swipeable deck. */
const DESKTOP_QUERY = '(min-width: 768px)';

interface SuggestionTexts {
  tagline: string;
  completed: string;
  duplicate: string;
  emptyHint: string;
  loadError: string;
}

@Component({
  selector: 'app-suggestions',
  imports: [SuggestionRow, SuggestionDeckView],
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

      @if (genreGroups().length) {
        <div class="mx-auto mt-4 max-w-3xl">
          <div class="flex justify-center">
            <button
              type="button"
              (click)="setGenre(null)"
              [class]="genre() === null ? activeChip : idleChip"
            >
              Todos
            </button>
          </div>
          @for (group of genreGroups(); track group.name) {
            <div class="mt-3">
              <p class="text-center text-[11px] uppercase tracking-wide text-muted">
                {{ group.name }}
              </p>
              <div class="mt-1.5 flex flex-wrap justify-center gap-1.5">
                @for (g of group.chips; track g.deckId) {
                  <button
                    type="button"
                    (click)="setGenre(g.deckId)"
                    [class]="genre() === g.deckId ? activeChip : idleChip"
                  >
                    {{ g.name }}
                  </button>
                }
              </div>
            </div>
          }
        </div>
      }

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
        @if (desktop()) {
          <div class="mx-auto mt-8 space-y-8 sm:w-fit">
            @for (section of sections(); track section.id) {
              <section>
                <h2 class="font-display text-lg font-semibold text-amber">{{ section.title }}</h2>
                <app-suggestion-row
                  class="mt-3 block"
                  [suggestions]="section.suggestions"
                  [type]="type()"
                  [completedLabel]="labels().completed"
                  [duplicateMessage]="labels().duplicate"
                  [refreshing]="refreshingId() === section.id"
                  (reload)="refreshSection(section.id)"
                />
              </section>
            }
          </div>
        } @else {
          <app-suggestion-deck
            class="mx-auto mt-6 block max-w-xs"
            [sections]="sections()"
            [type]="type()"
            [completedLabel]="labels().completed"
            [duplicateMessage]="labels().duplicate"
            [refreshing]="loading()"
            (reload)="load()"
          />
        }
      } @else {
        <div class="mt-12 text-center text-sm text-muted">
          <p>No hay más sugerencias por ahora.</p>
          <p class="mt-1">
            @if (genre()) {
              Ya tienes o has descartado lo más popular de esta categoría.
            } @else {
              {{ labels().emptyHint }}
            }
          </p>
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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly types: ItemType[] = ['MOVIE', 'BOOK'];
  readonly typeTabs: Record<ItemType, string> = { MOVIE: 'Películas', BOOK: 'Libros' };
  private readonly typePaths: Record<ItemType, string> = { MOVIE: 'movies', BOOK: 'books' };
  private readonly texts: Record<ItemType, SuggestionTexts> = {
    MOVIE: {
      tagline: 'Novedades y filas según lo que has visto y tus pendientes. Filtra por género.',
      completed: 'Vista',
      duplicate: 'Esta película ya está en tu colección.',
      emptyHint: 'Añade películas completadas o pendientes para afinar las sugerencias.',
      loadError: 'No se pudieron cargar las sugerencias. ¿Está configurada la key de TMDB?',
    },
    BOOK: {
      tagline: 'Libros afines a lo que ya has leído. Filtra por género.',
      completed: 'Leído',
      duplicate: 'Este libro ya está en tu colección.',
      emptyHint: 'Marca libros como completados para afinar las sugerencias.',
      loadError: 'No se pudieron cargar las sugerencias. ¿Está configurada la key de Google Books?',
    },
  };

  readonly activeChip = 'rounded-full border border-amber bg-amber/15 px-3 py-1 text-xs text-paper';
  readonly idleChip =
    'rounded-full border border-line px-3 py-1 text-xs text-muted transition hover:border-amber/60 hover:text-paper';

  readonly type = signal<ItemType>('MOVIE');
  readonly labels = computed(() => this.texts[this.type()]);
  readonly sections = signal<SuggestionDeck[]>([]);
  private readonly movieChips = signal<SuggestionGenre[]>([]);
  private readonly bookChips = signal<SuggestionGenre[]>([]);
  /** Both shelves browse by genre, each with its own chips. */
  readonly genres = computed(() => (this.type() === 'BOOK' ? this.bookChips() : this.movieChips()));
  /** One chip row per axis, in the order the backend sends them. */
  readonly genreGroups = computed(() => {
    const groups = new Map<string, SuggestionGenre[]>();
    for (const chip of this.genres()) {
      const chips = groups.get(chip.group);
      if (chips) {
        chips.push(chip);
      } else {
        groups.set(chip.group, [chip]);
      }
    }
    return [...groups].map(([name, chips]) => ({ name, chips }));
  });
  /** Deck id of the genre being browsed; null means the personalized rows. */
  readonly genre = signal<string | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly refreshingId = signal<string | null>(null);
  readonly refreshError = signal<string | null>(null);

  private readonly desktopQuery = matchMedia(DESKTOP_QUERY);
  /** Rows on desktop, swipeable deck on phones. */
  readonly desktop = signal(this.desktopQuery.matches);

  constructor() {
    this.desktopQuery.addEventListener('change', (e) => this.desktop.set(e.matches));
    this.loadGenres();
    // The URL decides the type: /suggestions/books opens straight on books.
    this.route.data.pipe(takeUntilDestroyed()).subscribe((data) => {
      this.type.set((data['type'] as ItemType | undefined) ?? 'MOVIE');
      // Chips are per type, so a genre cannot survive the switch.
      this.genre.set(null);
      this.load();
    });
  }

  setType(type: ItemType): void {
    if (this.type() === type) {
      return;
    }
    this.router.navigate(['/suggestions', this.typePaths[type]]);
  }

  setGenre(deckId: string | null): void {
    if (this.genre() === deckId) {
      return;
    }
    this.genre.set(deckId);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.refreshError.set(null);
    this.sections$().subscribe({
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

  /** A chip shows that one genre alone; without one, the personalized rows. */
  private sections$(): Observable<SuggestionDeck[]> {
    const genre = this.genre();
    const oneDeck = map((deck: SuggestionDeck): SuggestionDeck[] =>
      deck.suggestions.length ? [deck] : [],
    );
    if (this.type() === 'BOOK') {
      return genre
        ? this.suggestionApi.bookDeck(genre).pipe(oneDeck)
        : this.suggestionApi
            .books()
            .pipe(
              map((suggestions): SuggestionDeck[] =>
                suggestions.length ? [this.bookSection(suggestions)] : [],
              ),
            );
    }
    return genre
      ? this.suggestionApi.movieDeck(genre).pipe(oneDeck)
      : this.suggestionApi.movieDecks();
  }

  refreshSection(id: string): void {
    if (this.refreshingId() !== null) {
      return;
    }
    this.refreshingId.set(id);
    this.refreshError.set(null);
    const deck$ =
      this.type() === 'MOVIE'
        ? this.suggestionApi.movieDeck(id, true)
        : this.genre()
          ? this.suggestionApi.bookDeck(id)
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

  // Without the provider key these fail; the chips just stay hidden.
  private loadGenres(): void {
    this.suggestionApi.movieGenres().subscribe({
      next: (genres) => this.movieChips.set(genres),
      error: () => this.movieChips.set([]),
    });
    this.suggestionApi.bookGenres().subscribe({
      next: (genres) => this.bookChips.set(genres),
      error: () => this.bookChips.set([]),
    });
  }

  private bookSection(suggestions: Suggestion[]): SuggestionDeck {
    return { id: 'books', title: 'Afines a tus lecturas', suggestions };
  }
}

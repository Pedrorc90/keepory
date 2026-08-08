import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { switchMap } from 'rxjs';
import { ItemApi } from '../items/item-api';
import { ItemStatus, ItemType, ProviderBadge, providerBadges } from '../items/item.model';
import { MetadataApi } from '../items/metadata-api';
import { Suggestion, SuggestionApi, SuggestionDeck, trailerUrl } from './suggestion-api';

/** Drag distance that commits a swipe. */
const THRESHOLD = 90;
/** Logos that fit on the card above the title. */
const MAX_PROVIDERS = 3;
/** Cards drawn behind the top one. */
const STACK_DEPTH = 2;

type SwipeDirection = 'right' | 'left' | 'up';

interface DeckCard {
  suggestion: Suggestion;
  /** Section the card came from, shown as a label on the card. */
  category: string;
}

@Component({
  selector: 'app-suggestion-deck',
  template: `
    @if (notice(); as n) {
      <p class="mb-3 rounded-md border border-rust/50 bg-rust/10 px-3 py-1.5 text-center text-xs">
        {{ n }}
      </p>
    }

    @if (current(); as card) {
      <p class="text-center text-xs text-muted">
        {{ card.category }} · {{ index() + 1 }} de {{ cards().length }}
      </p>

      <div class="relative mt-3 aspect-2/3">
        @for (behind of stack(); track behind.suggestion.externalId; let i = $index) {
          <div
            class="absolute inset-0 overflow-hidden rounded-xl bg-panel ring-1 ring-line"
            [style.transform]="'scale(' + (0.94 - i * 0.04) + ') translateY(' + (i + 1) * 10 + 'px)'"
            [style.z-index]="stack().length - i"
            aria-hidden="true"
          >
            @if (behind.suggestion.coverUrl) {
              <img
                [src]="behind.suggestion.coverUrl"
                alt=""
                class="h-full w-full object-cover opacity-50"
              />
            }
          </div>
        }

        <article
          class="absolute inset-0 z-10 touch-none select-none overflow-hidden rounded-xl bg-panel shadow-xl ring-1 ring-line"
          [class]="flyClass()"
          [style.transform]="cardTransform()"
          [style.transition]="dragging() ? 'none' : 'transform 0.2s ease-out'"
          [style.--fly-x.px]="release().x"
          [style.--fly-y.px]="release().y"
          (pointerdown)="onPointerDown($event)"
          (pointermove)="onPointerMove($event)"
          (pointerup)="onPointerUp($event)"
          (pointercancel)="onPointerCancel($event)"
          (animationend)="onFlyEnd()"
        >
          @if (card.suggestion.coverUrl) {
            <img
              [src]="card.suggestion.coverUrl"
              [alt]="card.suggestion.title"
              draggable="false"
              class="h-full w-full object-cover"
            />
          } @else {
            <div class="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
              Sin carátula
            </div>
          }

          <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink/85 to-transparent p-4 pt-10">
            @if (watchProviders(card.suggestion) || card.suggestion.trailerKey) {
              <div class="mb-2 flex flex-wrap items-center gap-1.5">
                @for (provider of watchProviders(card.suggestion); track provider.name) {
                  @if (provider.icon) {
                    <img
                      [src]="provider.icon"
                      [alt]="provider.name"
                      [title]="provider.name"
                      draggable="false"
                      class="h-6 w-6 rounded"
                      loading="lazy"
                    />
                  } @else {
                    <span class="rounded bg-ink/70 px-1.5 py-0.5 text-[10px] text-muted ring-1 ring-line/60">
                      {{ provider.name }}
                    </span>
                  }
                }
                @if (card.suggestion.trailerKey) {
                  <!-- Stops the pointer here so opening the trailer is not read as a swipe. -->
                  <a
                    [href]="trailerUrl(card.suggestion)"
                    target="_blank"
                    rel="noopener"
                    (pointerdown)="$event.stopPropagation()"
                    class="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted transition hover:border-amber hover:text-amber"
                  >
                    ▶ Tráiler
                  </a>
                }
              </div>
            }
            <h2 class="font-display text-xl font-semibold leading-tight">{{ card.suggestion.title }}</h2>
            <p class="mt-0.5 text-xs text-muted">
              @if (card.suggestion.year) { {{ card.suggestion.year }} }
              @if (card.suggestion.voteAverage) { · ★ {{ card.suggestion.voteAverage.toFixed(1) }} }
            </p>
            @if (card.suggestion.overview) {
              <p class="mt-2 line-clamp-3 text-xs leading-relaxed text-muted">
                {{ card.suggestion.overview }}
              </p>
            }
          </div>

          <!-- Gesture feedback: each badge fades in as the drag heads its way. -->
          <span
            class="pointer-events-none absolute left-4 top-4 rounded-md border-2 border-moss px-3 py-1 font-display text-lg font-semibold uppercase text-moss"
            [style.opacity]="hint('right')"
            >{{ completedLabel() }}</span
          >
          <span
            class="pointer-events-none absolute right-4 top-4 rounded-md border-2 border-rust px-3 py-1 font-display text-lg font-semibold uppercase text-rust"
            [style.opacity]="hint('left')"
            >Descartar</span
          >
          <span
            class="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit rounded-md border-2 border-amber px-3 py-1 font-display text-lg font-semibold uppercase text-amber"
            [style.opacity]="hint('up')"
            >Pendiente</span
          >
        </article>
      </div>

      <div class="mt-4 flex flex-wrap items-stretch justify-center gap-2">
        <button
          type="button"
          (click)="swipe('left')"
          aria-label="Descartar"
          class="flex-1 rounded-md border border-line px-2 py-2 text-xs text-muted transition hover:border-rust hover:text-rust"
        >
          ✕ Descartar
        </button>
        <button
          type="button"
          (click)="swipe('up')"
          class="flex-1 rounded-md border border-amber/80 px-2 py-2 text-xs text-amber transition hover:bg-amber hover:text-ink"
        >
          ↑ Pendiente
        </button>
        @if (inProgressLabel(); as label) {
          <button
            type="button"
            (click)="markInProgress()"
            class="flex-1 rounded-md border border-dusk/80 px-2 py-2 text-xs text-dusk transition hover:bg-dusk hover:text-ink"
          >
            {{ label }}
          </button>
        }
        <button
          type="button"
          (click)="swipe('right')"
          class="flex-1 rounded-md bg-moss px-2 py-2 text-xs font-medium text-ink transition hover:brightness-110"
        >
          {{ completedLabel() }}
        </button>
      </div>

      <p class="mt-3 text-center text-xs text-muted">
        Arrastra: derecha {{ completedLabel().toLowerCase() }} · izquierda descartar · arriba pendiente
      </p>
    } @else {
      <!-- Last element of the deck: ask the server for a fresh set. -->
      <div class="relative mt-3 flex aspect-2/3 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-panel/40 px-6 text-center">
        <span class="text-4xl leading-none" [class.animate-spin]="refreshing()">↻</span>
        <p class="text-sm text-muted">
          @if (cards().length) {
            Has recorrido la baraja entera.
          } @else {
            No hay más sugerencias por ahora.
          }
        </p>
        <button
          type="button"
          (click)="reload.emit()"
          [disabled]="refreshing()"
          class="rounded-md border border-amber px-4 py-2 text-sm text-amber transition enabled:hover:bg-amber enabled:hover:text-ink disabled:opacity-60"
        >
          Más sugerencias
        </button>
      </div>
    }
  `,
})
export class SuggestionDeckView {
  private readonly metadataApi = inject(MetadataApi);
  private readonly itemApi = inject(ItemApi);
  private readonly suggestionApi = inject(SuggestionApi);

  readonly sections = input.required<SuggestionDeck[]>();
  readonly type = input.required<ItemType>();
  readonly completedLabel = input.required<string>();
  /** Null on shelves where "in progress" means nothing worth a button. */
  readonly inProgressLabel = input<string | null>(null);
  readonly duplicateMessage = input.required<string>();
  readonly refreshing = input(false);
  readonly reload = output<void>();
  readonly trailerUrl = trailerUrl;

  readonly index = signal(0);
  readonly notice = signal<string | null>(null);
  readonly dragging = signal(false);
  private readonly drag = signal({ x: 0, y: 0 });
  private readonly flying = signal<SwipeDirection | null>(null);
  /** Drag offset at release, so the fly-off animation continues the gesture. */
  readonly release = signal({ x: 0, y: 0 });
  private pointerId: number | null = null;

  // Section order is kept: every card of a category, then the next one.
  readonly cards = computed<DeckCard[]>(() =>
    this.sections().flatMap((section) =>
      section.suggestions.map((suggestion) => ({ suggestion, category: section.title })),
    ),
  );
  readonly current = computed<DeckCard | null>(() => this.cards()[this.index()] ?? null);
  readonly stack = computed(() => this.cards().slice(this.index() + 1, this.index() + 1 + STACK_DEPTH));

  readonly flyClass = computed(() => {
    switch (this.flying()) {
      case 'right':
        return 'card-fly-right';
      case 'left':
        return 'card-fly-left';
      case 'up':
        return 'card-fly-up';
      default:
        return this.dragging() ? '' : 'card-enter';
    }
  });

  readonly cardTransform = computed(() => {
    const { x, y } = this.drag();
    return `translate(${x}px, ${y}px) rotate(${x / 18}deg)`;
  });

  constructor() {
    // A reload hands in fresh sections; restart the deck from the top.
    effect(() => {
      this.sections();
      this.index.set(0);
      this.notice.set(null);
      this.resetDrag();
    });
  }

  /** Same logos the collection shows; three is all the card has room for. */
  watchProviders(suggestion: Suggestion): ProviderBadge[] | null {
    return providerBadges(suggestion.providers.slice(0, MAX_PROVIDERS));
  }

  /** Badge opacity for the direction the current drag is heading. */
  hint(direction: SwipeDirection): number {
    const { x, y } = this.drag();
    const distance =
      direction === 'up'
        ? Math.abs(x) > Math.abs(y)
          ? 0
          : Math.max(0, -y)
        : Math.abs(y) > Math.abs(x)
          ? 0
          : direction === 'right'
            ? Math.max(0, x)
            : Math.max(0, -x);
    return Math.min(1, distance / THRESHOLD);
  }

  onPointerDown(event: PointerEvent): void {
    if (this.flying()) {
      return;
    }
    this.pointerId = event.pointerId;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.dragging.set(true);
    this.drag.set({ x: 0, y: 0 });
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.dragging() || event.pointerId !== this.pointerId) {
      return;
    }
    // Downwards drags stay put: only right, left and up mean something.
    this.drag.set({ x: event.movementX + this.drag().x, y: Math.min(0, event.movementY + this.drag().y) });
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.dragging() || event.pointerId !== this.pointerId) {
      return;
    }
    this.dragging.set(false);
    this.pointerId = null;
    const { x, y } = this.drag();
    const direction: SwipeDirection | null =
      Math.abs(x) > Math.abs(y)
        ? x > THRESHOLD
          ? 'right'
          : x < -THRESHOLD
            ? 'left'
            : null
        : y < -THRESHOLD
          ? 'up'
          : null;
    if (direction) {
      this.release.set({ x, y });
      this.commit(direction);
    } else {
      this.drag.set({ x: 0, y: 0 });
    }
  }

  onPointerCancel(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) {
      return;
    }
    this.dragging.set(false);
    this.pointerId = null;
    this.drag.set({ x: 0, y: 0 });
  }

  /** Same outcome as the gesture, for the buttons below the deck. */
  swipe(direction: SwipeDirection): void {
    if (this.flying()) {
      return;
    }
    this.release.set({ x: 0, y: 0 });
    this.commit(direction);
  }

  onFlyEnd(): void {
    if (!this.flying()) {
      return;
    }
    this.flying.set(null);
    this.resetDrag();
    this.index.update((i) => i + 1);
  }

  // The card leaves right away and the request rides along: on a phone the
  // gesture has to feel instant, and a failure only costs a notice.
  private commit(direction: SwipeDirection, status?: ItemStatus): void {
    const card = this.current();
    if (!card) {
      return;
    }
    this.notice.set(null);
    this.flying.set(direction);
    if (direction === 'left') {
      this.suggestionApi.dismiss(card.suggestion).subscribe({ error: () => {} });
    } else {
      this.add(card.suggestion, status ?? (direction === 'right' ? 'COMPLETED' : 'PENDING'));
    }
  }

  // The only action without a gesture of its own: the card leaves upwards like
  // Pendiente does, since both mean "this one is not finished".
  markInProgress(): void {
    if (this.flying()) {
      return;
    }
    this.release.set({ x: 0, y: 0 });
    this.commit('up', 'IN_PROGRESS');
  }

  private add(suggestion: Suggestion, status: ItemStatus): void {
    this.metadataApi
      .detail(this.type(), suggestion.externalId)
      .pipe(
        switchMap((detail) =>
          this.itemApi.create({
            id: crypto.randomUUID(),
            type: this.type(),
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
        error: (err: HttpErrorResponse) =>
          this.notice.set(
            err.status === 409 ? this.duplicateMessage() : 'No se pudo añadir a la colección.',
          ),
      });
  }

  private resetDrag(): void {
    this.drag.set({ x: 0, y: 0 });
    this.release.set({ x: 0, y: 0 });
    this.dragging.set(false);
    this.pointerId = null;
  }
}

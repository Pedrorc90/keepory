import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, computed, effect, inject, input, output, signal } from '@angular/core';
import { switchMap } from 'rxjs';
import { ItemApi } from '../items/item-api';
import { ItemStatus, ItemType } from '../items/item.model';
import { MetadataApi } from '../items/metadata-api';
import { Suggestion, SuggestionApi } from './suggestion-api';

const VISIBLE_TILES = 8;
/** Grace period before a dismissal reaches the server. */
const UNDO_MS = 5000;

interface PendingDismissal {
  suggestion: Suggestion;
  /** Where the card sat, so undo puts it back in place. */
  index: number;
  timer: ReturnType<typeof setTimeout>;
}

@Component({
  selector: 'app-suggestion-row',
  template: `
    @if (notice(); as n) {
      <p class="mb-2 rounded-md border border-rust/50 bg-rust/10 px-3 py-1.5 text-xs">{{ n }}</p>
    }
    @if (pending(); as p) {
      <p class="mb-2 flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-1.5 text-xs text-muted">
        <span class="min-w-0 flex-1 truncate">Descartada «{{ p.suggestion.title }}»</span>
        <button type="button" (click)="undo()" class="shrink-0 text-amber underline">Deshacer</button>
      </p>
    }
    @if (visible().length) {
      <ul class="flex flex-wrap gap-4">
        @for (s of visible(); track s.externalId) {
          <li
            class="group w-32 shrink-0 sm:w-36"
            [class.tile-leave]="leavingId() === s.externalId"
            (animationend)="onLeaveEnd(s.externalId)"
          >
            <div class="relative aspect-2/3 overflow-hidden rounded-lg bg-panel ring-1 ring-line">
              @if (s.coverUrl) {
                <img [src]="s.coverUrl" [alt]="s.title" loading="lazy" class="h-full w-full object-cover" />
              } @else {
                <div class="flex h-full items-center justify-center p-3 text-center text-xs text-muted">
                  Sin carátula
                </div>
              }
              <button
                type="button"
                (click)="dismiss(s)"
                [disabled]="busy()"
                title="Descartar"
                aria-label="Descartar"
                class="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink/80 text-xs leading-none text-muted ring-1 ring-line/60 transition enabled:hover:bg-ink enabled:hover:text-rust disabled:opacity-30"
              >
                ✕
              </button>
            </div>
            <h3 class="mt-2 min-h-10 line-clamp-2 text-sm leading-snug">{{ s.title }}</h3>
            <p class="mt-0.5 h-4 text-xs text-muted">
              @if (s.year) { {{ s.year }} }
              @if (s.voteAverage) { · ★ {{ s.voteAverage.toFixed(1) }} }
            </p>
            <div class="mt-2 flex gap-1.5">
              <button
                type="button"
                (click)="add(s, 'PENDING')"
                [disabled]="busy()"
                class="flex-1 rounded-md border border-amber/80 px-1 py-1 text-xs text-amber transition enabled:hover:bg-amber enabled:hover:text-ink disabled:opacity-60"
              >
                Pendiente
              </button>
              <button
                type="button"
                (click)="add(s, 'COMPLETED')"
                [disabled]="busy()"
                class="flex-1 rounded-md bg-moss px-1 py-1 text-xs font-medium text-ink transition enabled:hover:brightness-110 disabled:opacity-60"
              >
                {{ completedLabel() }}
              </button>
            </div>
          </li>
        }
        <li class="w-32 shrink-0 sm:w-36">
          <button
            type="button"
            (click)="reload.emit()"
            [disabled]="refreshing() || busy()"
            title="Más sugerencias"
            aria-label="Más sugerencias"
            class="flex aspect-2/3 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-panel/40 text-muted transition enabled:hover:border-amber/60 enabled:hover:text-amber disabled:opacity-50"
          >
            <span class="block text-3xl leading-none" [class.animate-spin]="refreshing()">↻</span>
            <span class="px-2 text-center text-xs leading-snug">Más sugerencias</span>
          </button>
        </li>
      </ul>
    } @else {
      <p class="py-4 text-sm text-muted">
        No quedan sugerencias en esta sección.
        <button type="button" (click)="reload.emit()" class="ml-1 text-amber underline">
          Buscar de nuevo
        </button>
      </p>
    }
  `,
})
export class SuggestionRow implements OnDestroy {
  private readonly metadataApi = inject(MetadataApi);
  private readonly itemApi = inject(ItemApi);
  private readonly suggestionApi = inject(SuggestionApi);

  readonly suggestions = input.required<Suggestion[]>();
  readonly type = input.required<ItemType>();
  readonly completedLabel = input.required<string>();
  readonly duplicateMessage = input.required<string>();
  readonly refreshing = input(false);
  readonly reload = output<void>();

  readonly cards = signal<Suggestion[]>([]);
  readonly busy = signal(false);
  readonly notice = signal<string | null>(null);
  readonly leavingId = signal<string | null>(null);
  readonly pending = signal<PendingDismissal | null>(null);

  // The rest of the deck backfills the row as visible tiles are consumed.
  readonly visible = computed(() => this.cards().slice(0, VISIBLE_TILES));

  constructor() {
    // A reload hands in a fresh suggestions array; restart the row.
    effect(() => {
      const suggestions = this.suggestions();
      // The row is about to be rebuilt, so there is nothing left to undo into.
      this.commitDismissal();
      this.cards.set(suggestions);
      this.busy.set(false);
      this.notice.set(null);
      this.leavingId.set(null);
    });
  }

  ngOnDestroy(): void {
    this.commitDismissal();
  }

  add(suggestion: Suggestion, status: ItemStatus): void {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.notice.set(null);
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
        next: () => this.leavingId.set(suggestion.externalId),
        error: (err: HttpErrorResponse) => {
          if (err.status === 409) {
            // Already in the collection: explain and drop the card anyway.
            this.notice.set(this.duplicateMessage());
            this.leavingId.set(suggestion.externalId);
          } else {
            this.notice.set('No se pudo añadir a la colección.');
            this.busy.set(false);
          }
        },
      });
  }

  // The card leaves at once but the dismissal only reaches the server after the
  // undo window, so a misclick costs nothing.
  dismiss(suggestion: Suggestion): void {
    if (this.busy()) {
      return;
    }
    this.commitDismissal();
    this.notice.set(null);
    this.pending.set({
      suggestion,
      index: this.cards().findIndex((c) => c.externalId === suggestion.externalId),
      timer: setTimeout(() => this.commitDismissal(), UNDO_MS),
    });
    this.leavingId.set(suggestion.externalId);
  }

  undo(): void {
    const pending = this.pending();
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pending.set(null);
    // Undoing mid-animation: stop the exit before onLeaveEnd drops the card.
    if (this.leavingId() === pending.suggestion.externalId) {
      this.leavingId.set(null);
    }
    this.cards.update((cards) => {
      if (cards.some((c) => c.externalId === pending.suggestion.externalId)) {
        return cards;
      }
      const restored = [...cards];
      restored.splice(Math.max(0, Math.min(pending.index, restored.length)), 0, pending.suggestion);
      return restored;
    });
    this.busy.set(false);
  }

  /** Sends the pending dismissal now; a failure just lets it resurface later. */
  private commitDismissal(): void {
    const pending = this.pending();
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pending.set(null);
    this.suggestionApi.dismiss(pending.suggestion).subscribe({ error: () => {} });
  }

  onLeaveEnd(externalId: string): void {
    if (this.leavingId() !== externalId) {
      return;
    }
    this.cards.update((cards) => cards.filter((c) => c.externalId !== externalId));
    this.leavingId.set(null);
    this.busy.set(false);
  }
}

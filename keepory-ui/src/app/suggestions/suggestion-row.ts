import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { switchMap } from 'rxjs';
import { ItemApi } from '../items/item-api';
import { ItemStatus, ItemType } from '../items/item.model';
import { MetadataApi } from '../items/metadata-api';
import { Suggestion } from './suggestion-api';

const VISIBLE_TILES = 8;

@Component({
  selector: 'app-suggestion-row',
  template: `
    @if (notice(); as n) {
      <p class="mb-2 rounded-md border border-rust/50 bg-rust/10 px-3 py-1.5 text-xs">{{ n }}</p>
    }
    @if (visible().length) {
      <ul class="flex flex-wrap gap-4">
        @for (s of visible(); track s.externalId) {
          <li
            class="w-32 shrink-0 sm:w-36"
            [class.tile-leave]="leavingId() === s.externalId"
            (animationend)="onLeaveEnd(s.externalId)"
          >
            <div class="aspect-2/3 overflow-hidden rounded-lg bg-panel ring-1 ring-line">
              @if (s.coverUrl) {
                <img [src]="s.coverUrl" [alt]="s.title" loading="lazy" class="h-full w-full object-cover" />
              } @else {
                <div class="flex h-full items-center justify-center p-3 text-center text-xs text-muted">
                  Sin carátula
                </div>
              }
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
export class SuggestionRow {
  private readonly metadataApi = inject(MetadataApi);
  private readonly itemApi = inject(ItemApi);

  readonly suggestions = input.required<Suggestion[]>();
  readonly type = input.required<ItemType>();
  readonly completedLabel = input.required<string>();
  readonly duplicateMessage = input.required<string>();
  readonly reload = output<void>();

  readonly cards = signal<Suggestion[]>([]);
  readonly busy = signal(false);
  readonly notice = signal<string | null>(null);
  readonly leavingId = signal<string | null>(null);

  // The rest of the deck backfills the row as visible tiles are consumed.
  readonly visible = computed(() => this.cards().slice(0, VISIBLE_TILES));

  constructor() {
    // A reload hands in a fresh suggestions array; restart the row.
    effect(() => {
      this.cards.set(this.suggestions());
      this.busy.set(false);
      this.notice.set(null);
      this.leavingId.set(null);
    });
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

  onLeaveEnd(externalId: string): void {
    if (this.leavingId() !== externalId) {
      return;
    }
    this.cards.update((cards) => cards.filter((c) => c.externalId !== externalId));
    this.leavingId.set(null);
    this.busy.set(false);
  }
}

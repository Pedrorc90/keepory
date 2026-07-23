import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ItemApi, ItemSort } from './item-api';
import {
  ITEM_STATUSES,
  Item,
  ItemStatus,
  ItemType,
  Page,
  ProviderBadge,
  STATUS_LABELS,
  STATUS_SPINE_CLASSES,
  providerBadges,
} from './item.model';

@Component({
  selector: 'app-item-list',
  imports: [RouterLink],
  template: `
    <div class="flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <h1 class="font-display text-3xl font-semibold">
        MyKeep@if (headingSuffix(); as suffix) {
          <span class="ml-2 align-middle font-sans text-sm font-normal uppercase tracking-[0.25em] text-amber">
            {{ suffix }}
          </span>
        }
      </h1>
      @if (result(); as page) {
        <span class="text-sm text-muted">{{ page.totalElements }} en la estantería</span>
      }
      <a
        routerLink="/items/new"
        class="ml-auto rounded-md bg-amber px-4 py-2 text-sm font-medium text-ink transition hover:brightness-110"
      >
        Añadir
      </a>
    </div>

    <div class="mt-7 items-start gap-8 md:flex">
      <aside class="md:order-last md:w-36 md:shrink-0">
        <p class="mb-2 hidden text-xs uppercase tracking-wide text-muted md:block">Estado</p>
        <nav class="flex flex-wrap gap-2 md:flex-col md:items-start" aria-label="Filtrar por estado">
          @for (bubble of statusBubbles; track bubble.label) {
            <button
              (click)="filterByStatus(bubble.value)"
              [attr.aria-pressed]="status() === bubble.value"
              class="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition focus-visible:outline-none"
              [class]="
                status() === bubble.value
                  ? 'border-amber bg-amber/15 text-paper'
                  : 'border-line text-muted hover:border-amber/60 hover:text-paper'
              "
            >
              @if (bubble.value) {
                <span class="h-2 w-2 rounded-full" [class]="spineClasses[bubble.value]"></span>
              }
              {{ bubble.label }}
            </button>
          }
        </nav>
      </aside>

      <div class="mt-7 min-w-0 flex-1 md:mt-0">
    <div class="flex flex-wrap items-center gap-2">
      <input
        type="search"
        [value]="q()"
        (input)="search($any($event.target).value)"
        placeholder="Buscar por título…"
        class="min-w-48 flex-1 rounded-md border border-line bg-panel px-3 py-2 text-sm placeholder:text-muted focus:border-amber focus:outline-none"
        aria-label="Buscar por título"
      />
      <label class="flex items-center gap-2 text-sm text-muted">
        Ordenar por
        <select
          [value]="sort()"
          (change)="sortBy($any($event.target).value)"
          class="rounded-md border border-line bg-panel px-2.5 py-2 text-sm text-paper focus:border-amber focus:outline-none"
        >
          @for (option of sortOptions; track option.value) {
            <option [value]="option.value">{{ option.label }}</option>
          }
        </select>
      </label>
    </div>

    @if (error()) {
      <p class="mt-8 rounded-md border border-rust/50 bg-rust/10 px-4 py-3 text-sm">{{ error() }}</p>
    } @else if (loading() && !result()) {
      <p class="mt-8 text-sm text-muted">Cargando la estantería…</p>
    } @else if (result(); as page) {
      @if (page.content.length === 0) {
        <div class="mt-14 text-center">
          <p class="font-display text-xl">La estantería está vacía</p>
          <p class="mt-2 text-sm text-muted">
            @if (hasFilters()) {
              Ningún elemento coincide con los filtros.
            } @else {
              Añade la primera película o libro para empezar.
            }
          </p>
        </div>
      } @else {
        <ul class="mt-7 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-9">
          @for (item of page.content; track item.id) {
            <li class="group">
              <a [routerLink]="['/items', item.id, 'edit']" class="block">
                <div
                  class="relative aspect-2/3 overflow-hidden rounded-md bg-panel ring-1 ring-line transition duration-200 group-hover:-translate-y-1 group-hover:shadow-lg group-hover:shadow-black/40 group-hover:ring-amber/60"
                >
                  @if (item.coverUrl) {
                    <img [src]="item.coverUrl" [alt]="item.title" class="h-full w-full object-cover" loading="lazy" />
                  } @else {
                    <div class="flex h-full items-center justify-center p-4 text-center font-display text-lg text-muted">
                      {{ item.title }}
                    </div>
                  }
                  <span class="absolute inset-x-0 bottom-0 h-1.5" [class]="spineClasses[item.status]"></span>
                  @if (item.type === 'MOVIE') {
                    <svg class="absolute right-2 top-0 h-10 w-4 text-rust drop-shadow-md" viewBox="0 0 16 40" aria-hidden="true">
                      <rect width="16" height="40" fill="currentColor" />
                      <g fill="rgba(0, 0, 0, 0.45)">
                        <rect x="2.5" y="3" width="3" height="4.5" rx="1" />
                        <rect x="2.5" y="11" width="3" height="4.5" rx="1" />
                        <rect x="2.5" y="19" width="3" height="4.5" rx="1" />
                        <rect x="2.5" y="27" width="3" height="4.5" rx="1" />
                        <rect x="10.5" y="3" width="3" height="4.5" rx="1" />
                        <rect x="10.5" y="11" width="3" height="4.5" rx="1" />
                        <rect x="10.5" y="19" width="3" height="4.5" rx="1" />
                        <rect x="10.5" y="27" width="3" height="4.5" rx="1" />
                      </g>
                    </svg>
                  } @else if (item.type === 'BOOK') {
                    <svg class="absolute right-2 top-0 h-10 w-4 text-moss drop-shadow-md" viewBox="0 0 16 40" aria-hidden="true">
                      <path d="M0 0h16v40l-8-7-8 7z" fill="currentColor" />
                    </svg>
                  }
                </div>
              </a>
              <div class="mt-2 flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-sm">{{ item.title }}</p>
                  @if (watchProviders(item); as providers) {
                    <div class="mt-0.5 flex flex-wrap items-center gap-1">
                      @for (provider of providers; track provider.name) {
                        @if (provider.icon) {
                          <img
                            [src]="provider.icon"
                            [alt]="provider.name"
                            [title]="provider.name"
                            class="h-5 w-5 rounded"
                            loading="lazy"
                          />
                        } @else {
                          <span class="text-xs text-muted">{{ provider.name }}</span>
                        }
                      }
                    </div>
                  }
                  @if (item.rating) {
                    <p class="text-xs text-amber">{{ stars(item.rating) }}</p>
                  }
                </div>
                <button
                  (click)="remove(item)"
                  class="rounded p-1 text-muted opacity-0 transition hover:text-rust focus-visible:opacity-100 group-hover:opacity-100"
                  [attr.aria-label]="'Eliminar ' + item.title"
                >
                  ✕
                </button>
              </div>
            </li>
          }
        </ul>

        @if (page.totalPages > 1) {
          <nav class="mt-8 flex items-center justify-center gap-4 text-sm" aria-label="Paginación">
            <button
              (click)="goTo(page.number - 1)"
              [disabled]="page.number === 0"
              class="rounded-md border border-line px-3 py-1.5 transition enabled:hover:border-amber disabled:opacity-40"
            >
              Anterior
            </button>
            <span class="text-muted">Página {{ page.number + 1 }} de {{ page.totalPages }}</span>
            <button
              (click)="goTo(page.number + 1)"
              [disabled]="page.number + 1 >= page.totalPages"
              class="rounded-md border border-line px-3 py-1.5 transition enabled:hover:border-amber disabled:opacity-40"
            >
              Siguiente
            </button>
          </nav>
        }
      }
    }
      </div>
    </div>
  `,
})
export class ItemList {
  private readonly api = inject(ItemApi);

  readonly statusBubbles: { value: ItemStatus | ''; label: string }[] = [
    { value: '', label: 'Todos' },
    ...ITEM_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
  ];
  readonly spineClasses = STATUS_SPINE_CLASSES;
  readonly sortOptions: { value: ItemSort; label: string }[] = [
    { value: 'title', label: 'Título' },
    { value: 'genre', label: 'Género' },
    { value: 'recent', label: 'Recientes' },
  ];

  readonly type = signal<ItemType | ''>('');
  readonly headingSuffix = computed(() => {
    switch (this.type()) {
      case 'MOVIE':
        return 'Movies';
      case 'BOOK':
        return 'Books';
      default:
        return '';
    }
  });
  readonly sort = signal<ItemSort>('recent');
  readonly status = signal<ItemStatus | ''>('');
  readonly q = signal('');
  readonly result = signal<Page<Item> | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private page = 0;
  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(ActivatedRoute)
      .data.pipe(takeUntilDestroyed())
      .subscribe((data) => {
        this.type.set((data['type'] as ItemType | undefined) ?? '');
        this.status.set('');
        this.q.set('');
        this.page = 0;
        this.load();
      });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .list({
        type: this.type() || null,
        status: this.status() || null,
        q: this.q().trim() || null,
        sort: this.sort(),
        page: this.page,
      })
      .subscribe({
        next: (page) => {
          this.result.set(page);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('No se pudo cargar la colección. Comprueba que el backend está en marcha.');
          this.loading.set(false);
        },
      });
  }

  filterByStatus(value: string): void {
    this.status.set(value as ItemStatus | '');
    this.page = 0;
    this.load();
  }

  sortBy(value: string): void {
    this.sort.set(value as ItemSort);
    this.page = 0;
    this.load();
  }

  search(value: string): void {
    this.q.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page = 0;
      this.load();
    }, 300);
  }

  goTo(page: number): void {
    this.page = page;
    this.load();
  }

  hasFilters(): boolean {
    return this.status() !== '' || this.q().trim() !== '';
  }

  stars(rating: number): string {
    return '★'.repeat(rating);
  }

  watchProviders(item: Item): ProviderBadge[] | null {
    return providerBadges(item.attributes['watchProviders']);
  }

  remove(item: Item): void {
    if (!confirm(`¿Eliminar «${item.title}» de la colección?`)) return;
    this.api.delete(item.id).subscribe({
      next: () => this.load(),
      error: () => this.error.set(`No se pudo eliminar «${item.title}».`),
    });
  }
}

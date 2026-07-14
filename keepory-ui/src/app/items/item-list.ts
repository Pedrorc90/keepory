import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ItemApi } from './item-api';
import {
  ITEM_STATUSES,
  ITEM_TYPES,
  Item,
  ItemStatus,
  ItemType,
  Page,
  STATUS_LABELS,
  STATUS_SPINE_CLASSES,
  TYPE_LABELS,
} from './item.model';

@Component({
  selector: 'app-item-list',
  imports: [RouterLink],
  template: `
    <div class="flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <h1 class="font-display text-3xl font-semibold">Colección</h1>
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

    <div class="mt-5 flex flex-wrap items-center gap-2">
      <select
        [value]="type()"
        (change)="filterByType($any($event.target).value)"
        class="rounded-md border border-line bg-panel px-3 py-2 text-sm focus:border-amber focus:outline-none"
        aria-label="Filtrar por tipo"
      >
        <option value="">Todo</option>
        @for (t of types; track t) {
          <option [value]="t">{{ typeLabels[t] }}s</option>
        }
      </select>
      <select
        [value]="status()"
        (change)="filterByStatus($any($event.target).value)"
        class="rounded-md border border-line bg-panel px-3 py-2 text-sm focus:border-amber focus:outline-none"
        aria-label="Filtrar por estado"
      >
        <option value="">Cualquier estado</option>
        @for (s of statuses; track s) {
          <option [value]="s">{{ statusLabels[s] }}</option>
        }
      </select>
      <input
        type="search"
        [value]="q()"
        (input)="search($any($event.target).value)"
        placeholder="Buscar por título…"
        class="min-w-48 flex-1 rounded-md border border-line bg-panel px-3 py-2 text-sm placeholder:text-muted focus:border-amber focus:outline-none"
        aria-label="Buscar por título"
      />
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
        <ul class="mt-7 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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
                </div>
              </a>
              <div class="mt-2 flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate text-sm" [title]="item.title">{{ item.title }}</p>
                  <p class="text-xs text-muted">
                    {{ typeLabels[item.type] }} · {{ statusLabels[item.status] }}@if (item.rating) {
                      · <span class="text-amber">{{ stars(item.rating) }}</span>
                    }
                  </p>
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
  `,
})
export class ItemList {
  private readonly api = inject(ItemApi);

  readonly types = ITEM_TYPES;
  readonly statuses = ITEM_STATUSES;
  readonly typeLabels = TYPE_LABELS;
  readonly statusLabels = STATUS_LABELS;
  readonly spineClasses = STATUS_SPINE_CLASSES;

  readonly type = signal<ItemType | ''>('');
  readonly status = signal<ItemStatus | ''>('');
  readonly q = signal('');
  readonly result = signal<Page<Item> | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private page = 0;
  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .list({
        type: this.type() || null,
        status: this.status() || null,
        q: this.q().trim() || null,
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

  filterByType(value: string): void {
    this.type.set(value as ItemType | '');
    this.page = 0;
    this.load();
  }

  filterByStatus(value: string): void {
    this.status.set(value as ItemStatus | '');
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
    return this.type() !== '' || this.status() !== '' || this.q().trim() !== '';
  }

  stars(rating: number): string {
    return '★'.repeat(rating);
  }

  remove(item: Item): void {
    if (!confirm(`¿Eliminar «${item.title}» de la colección?`)) return;
    this.api.delete(item.id).subscribe({
      next: () => this.load(),
      error: () => this.error.set(`No se pudo eliminar «${item.title}».`),
    });
  }
}

import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { combineLatest } from 'rxjs';
import { CollectionApi } from '../collections/collection-api';
import { DragState } from '../collections/drag-state';
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
      @if (activeCollection(); as collection) {
        <span class="flex items-center gap-2 rounded-full border border-amber/50 bg-amber/10 px-3 py-1 text-sm">
          {{ collection.name }}
          <button
            (click)="deleteCollection(collection)"
            class="text-muted transition hover:text-rust"
            [attr.aria-label]="'Eliminar la colección ' + collection.name"
            title="Eliminar colección"
          >
            ✕
          </button>
        </span>
      }
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
            <li class="group" [class.opacity-40]="draggingId() === item.id">
              <a
                [routerLink]="['/items', item.id, 'edit']"
                class="block"
                [draggable]="true"
                (dragstart)="startDrag($event, item)"
                (dragend)="endDrag()"
                (click)="onCardClick($event)"
              >
                <div
                  class="relative aspect-2/3 overflow-hidden rounded-md bg-panel ring-1 ring-line transition duration-200 group-hover:-translate-y-1 group-hover:shadow-lg group-hover:shadow-black/40 group-hover:ring-amber/60"
                >
                  @if (item.coverUrl) {
                    <img
                      [src]="item.coverUrl"
                      [alt]="item.title"
                      class="h-full w-full object-cover"
                      loading="lazy"
                      draggable="false"
                    />
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
                <div class="flex shrink-0 items-start">
                  <button
                    (click)="openPicker(item)"
                    class="rounded p-1 text-muted opacity-0 transition hover:text-amber focus-visible:opacity-100 group-hover:opacity-100"
                    [attr.aria-label]="'Añadir ' + item.title + ' a una colección'"
                    title="Añadir a una colección"
                  >
                    ＋
                  </button>
                  <button
                    (click)="remove(item)"
                    class="rounded p-1 text-muted opacity-0 transition hover:text-rust focus-visible:opacity-100 group-hover:opacity-100"
                    [attr.aria-label]="'Eliminar ' + item.title"
                  >
                    ✕
                  </button>
                </div>
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

    @if (picker(); as item) {
      <div
        class="fixed inset-0 z-20 flex items-center justify-center bg-ink/70 p-4"
        (click)="closePicker()"
        role="dialog"
        aria-modal="true"
      >
        <div (click)="$event.stopPropagation()" class="w-full max-w-sm rounded-xl border border-line bg-panel p-5 shadow-xl">
          <p class="font-display text-lg">Añadir a una colección</p>
          <p class="mt-1 truncate text-sm text-muted">{{ item.title }}</p>

          <ul class="mt-4 grid max-h-64 gap-1 overflow-y-auto">
            @for (collection of pickerOptions(); track collection.id) {
              <li>
                <label class="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm transition hover:bg-paper/5">
                  <input
                    type="checkbox"
                    [checked]="pickerIds().includes(collection.id)"
                    (change)="togglePicker(item, collection.id)"
                    class="h-4 w-4 accent-amber"
                  />
                  <span class="min-w-0 flex-1 truncate">{{ collection.name }}</span>
                  <span class="text-xs text-muted">{{ collection.itemCount }}</span>
                </label>
              </li>
            } @empty {
              <li class="px-2 py-2 text-sm text-muted">Todavía no hay colecciones.</li>
            }
          </ul>

          <div class="mt-4 flex gap-2 border-t border-line pt-4">
            <input
              #newName
              (keydown.enter)="createCollection(item, newName)"
              placeholder="Nueva colección…"
              maxlength="120"
              class="min-w-0 flex-1 rounded-md border border-line bg-ink px-3 py-2 text-sm placeholder:text-muted focus:border-amber focus:outline-none"
              aria-label="Nombre de la nueva colección"
            />
            <button
              (click)="createCollection(item, newName)"
              class="rounded-md border border-line px-3 py-2 text-sm transition hover:border-amber"
            >
              Crear
            </button>
          </div>

          @if (pickerError()) {
            <p class="mt-3 text-xs text-rust">{{ pickerError() }}</p>
          }

          <button (click)="closePicker()" class="mt-4 w-full rounded-md bg-amber px-4 py-2 text-sm font-medium text-ink transition hover:brightness-110">
            Listo
          </button>
        </div>
      </div>
    }
  `,
})
export class ItemList {
  private readonly api = inject(ItemApi);
  private readonly collections = inject(CollectionApi);
  private readonly drag = inject(DragState);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

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
  readonly collectionId = signal<string | null>(null);
  readonly activeCollection = computed(() => {
    const id = this.collectionId();
    return id ? (this.collections.byId(id) ?? null) : null;
  });
  readonly result = signal<Page<Item> | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly draggingId = computed(() => this.drag.item()?.id ?? null);
  private dragJustEnded = false;

  readonly picker = signal<Item | null>(null);
  readonly pickerIds = signal<string[]>([]);
  readonly pickerError = signal<string | null>(null);
  readonly pickerOptions = computed(() => {
    const item = this.picker();
    return item ? this.collections.forType(item.type) : [];
  });

  private page = 0;
  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    combineLatest([this.route.data, this.route.queryParamMap])
      .pipe(takeUntilDestroyed())
      .subscribe(([data, params]) => {
        this.type.set((data['type'] as ItemType | undefined) ?? '');
        this.collectionId.set(params.get('collection'));
        this.status.set('');
        this.q.set('');
        this.page = 0;
        this.load();
      });

    // A drop only changes what is on screen when the shelf is filtered by that collection.
    effect(() => {
      const drop = this.drag.dropped();
      if (drop && drop.collectionId === untracked(() => this.collectionId())) this.load();
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
        collectionId: this.collectionId(),
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

  startDrag(event: DragEvent, item: Item): void {
    this.drag.start(item);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('text/plain', item.id);
    }
  }

  endDrag(): void {
    this.drag.end();
    // A cancelled drag fires a click on the card afterwards; swallow that one
    // so releasing the item outside a collection does not open the editor.
    this.dragJustEnded = true;
    setTimeout(() => (this.dragJustEnded = false));
  }

  /** Blocks the routerLink navigation triggered by the click that follows a drag. */
  onCardClick(event: MouseEvent): void {
    if (this.dragJustEnded) event.preventDefault();
  }

  openPicker(item: Item): void {
    this.picker.set(item);
    this.pickerIds.set([]);
    this.pickerError.set(null);
    this.collections.ofItem(item.id).subscribe({
      next: (ids) => this.pickerIds.set(ids),
      error: () => this.pickerError.set('No se pudieron cargar las colecciones del elemento.'),
    });
  }

  closePicker(): void {
    this.picker.set(null);
    // Reload only when filtering by a collection: membership may have changed.
    if (this.collectionId()) this.load();
  }

  togglePicker(item: Item, collectionId: string): void {
    const selected = this.pickerIds().includes(collectionId);
    const call = selected
      ? this.collections.removeItem(collectionId, item.id)
      : this.collections.addItem(collectionId, item.id);
    this.pickerError.set(null);
    call.subscribe({
      next: () =>
        this.pickerIds.update((ids) =>
          selected ? ids.filter((id) => id !== collectionId) : [...ids, collectionId],
        ),
      error: () => this.pickerError.set('No se pudo actualizar la colección.'),
    });
  }

  createCollection(item: Item, input: HTMLInputElement): void {
    const name = input.value.trim();
    if (!name) return;
    this.pickerError.set(null);
    // Created with the item's type so it shows up under Películas or Libros.
    this.collections.create(name, item.type).subscribe({
      next: (collection) => {
        input.value = '';
        this.togglePicker(item, collection.id);
      },
      error: (err: { status?: number }) =>
        this.pickerError.set(
          err.status === 409 ? 'Ya existe una colección con ese nombre.' : 'No se pudo crear la colección.',
        ),
    });
  }

  deleteCollection(collection: { id: string; name: string }): void {
    if (!confirm(`¿Eliminar la colección «${collection.name}»? Los elementos no se borran.`)) return;
    this.collections.delete(collection.id).subscribe({
      next: () => this.router.navigate([], { relativeTo: this.route, queryParams: {} }),
      error: () => this.error.set('No se pudo eliminar la colección.'),
    });
  }

  remove(item: Item): void {
    if (!confirm(`¿Eliminar «${item.title}» de la colección?`)) return;
    this.api.delete(item.id).subscribe({
      next: () => this.load(),
      error: () => this.error.set(`No se pudo eliminar «${item.title}».`),
    });
  }
}

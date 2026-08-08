import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { combineLatest } from 'rxjs';
import { Collection, CollectionApi } from '../collections/collection-api';
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

/** Folders only, loose items only, or the whole shelf. */
type ShelfView = 'collections' | 'items' | 'all';

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
      @if (countLabel(); as label) {
        <span class="text-sm text-muted">{{ label }}</span>
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
    @if (!collectionId()) {
      <nav
        class="mx-auto mb-3 flex w-fit rounded-lg border border-line bg-panel/60 p-0.5 text-sm"
        aria-label="Cambiar de vista"
      >
        @for (option of viewOptions(); track option.value) {
          <button
            (click)="changeView(option.value)"
            [attr.aria-pressed]="view() === option.value"
            class="rounded-md px-3 py-1.5 transition"
            [class]="view() === option.value ? 'bg-amber/15 text-paper' : 'text-muted hover:text-paper'"
          >
            {{ option.label }}
          </button>
        }
      </nav>
    }
    <div class="flex flex-wrap items-center gap-2">
      <input
        type="search"
        [value]="q()"
        (input)="search($any($event.target).value)"
        [placeholder]="view() === 'collections' ? 'Buscar colección…' : 'Buscar por título…'"
        class="min-w-48 flex-1 rounded-md border border-line bg-panel px-3 py-2 text-sm placeholder:text-muted focus:border-amber focus:outline-none"
        [attr.aria-label]="view() === 'collections' ? 'Buscar colección' : 'Buscar por título'"
      />
      @if (view() !== 'collections') {
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
      }
    </div>

    <a
      [routerLink]="suggestionsLink()"
      class="group mx-auto mt-3 flex w-fit items-center gap-2 rounded-full border border-line bg-panel/60 py-1.5 pl-3 pr-3.5 text-sm text-muted transition hover:border-amber/60 hover:bg-amber/10 hover:text-paper"
    >
      <svg
        class="h-3.5 w-3.5 text-amber/80 transition group-hover:text-amber"
        viewBox="0 0 16 16"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M6.5 1l1.3 4.2L12 6.5 7.8 7.8 6.5 12 5.2 7.8 1 6.5l4.2-1.3z" />
        <path d="M12 9l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3L9 12l2.3-.7z" />
      </svg>
      Descubrir
      <span class="inline-block text-muted/60 transition group-hover:translate-x-0.5 group-hover:text-amber">
        →
      </span>
    </a>

    @if (error()) {
      <p class="mt-8 rounded-md border border-rust/50 bg-rust/10 px-4 py-3 text-sm">{{ error() }}</p>
    } @else if (loading() && !result()) {
      <p class="mt-8 text-sm text-muted">Cargando la estantería…</p>
    } @else if (result(); as page) {
      @if (visibleItems().length === 0 && shelfCollections().length === 0) {
        <div class="mt-14 text-center">
          @if (view() === 'collections' && !collectionId()) {
            <p class="font-display text-xl">No hay colecciones</p>
            <p class="mt-2 text-sm text-muted">
              @if (q().trim()) {
                Ninguna colección se llama así.
              } @else {
                Créalas desde el panel de la izquierda o con ＋ en una tarjeta.
              }
            </p>
          } @else {
            <p class="font-display text-xl">La estantería está vacía</p>
            <p class="mt-2 text-sm text-muted">
              @if (hasFilters()) {
                Ningún elemento coincide con los filtros.
              } @else {
                Añade la primera película o libro para empezar.
              }
            </p>
          }
        </div>
      } @else {
        <ul class="mt-7 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-9">
          @for (collection of shelfCollections(); track collection.id) {
            <li class="group">
              <a
                [routerLink]="[]"
                [queryParams]="{ collection: collection.id }"
                class="block"
                [attr.aria-label]="'Abrir la colección ' + collection.name"
                (dragover)="onCollectionDragOver($event, collection)"
                (dragleave)="onCollectionDragLeave(collection)"
                (drop)="onCollectionDrop($event, collection)"
              >
                <!-- A folder: a tab on top, covers filed inside, and a front flap
                     that covers their lower half so they read as tucked in. -->
                <div class="relative aspect-2/3 transition duration-200 group-hover:-translate-y-1">
                  <span
                    class="absolute left-0 top-0 h-[8%] w-[46%] rounded-t-md border border-b-0 bg-panel transition"
                    [class]="dropTarget() === collection.id ? 'border-amber' : 'border-amber/25 group-hover:border-amber/60'"
                  ></span>
                  <div
                    class="absolute inset-x-0 bottom-0 top-[6.5%] overflow-hidden rounded-md rounded-tl-none border bg-panel transition group-hover:shadow-lg group-hover:shadow-black/40"
                    [class]="dropTarget() === collection.id ? 'border-amber' : 'border-amber/25 group-hover:border-amber/60'"
                  >
                    @if (collection.covers.length >= 4) {
                      <div class="absolute inset-[6%] grid grid-cols-2 grid-rows-2 gap-1">
                        @for (cover of collection.covers; track cover) {
                          <img
                            [src]="cover"
                            alt=""
                            class="h-full w-full rounded-sm object-cover shadow-sm shadow-black/40"
                            loading="lazy"
                            draggable="false"
                          />
                        }
                      </div>
                    } @else if (collection.covers.length) {
                      <div class="absolute inset-[6%] flex justify-center gap-1">
                        @for (cover of collection.covers; track cover) {
                          <img
                            [src]="cover"
                            alt=""
                            class="h-full min-w-0 max-w-[52%] flex-1 rounded-sm object-cover shadow-sm shadow-black/40"
                            loading="lazy"
                            draggable="false"
                          />
                        }
                      </div>
                    } @else {
                      <div class="flex h-full items-center justify-center p-4 pb-[35%] text-center font-display text-muted">
                        Vacía
                      </div>
                    }
                    <!-- The flap: opaque at the bottom, fading where the covers slide behind it. -->
                    <span
                      class="pointer-events-none absolute inset-x-0 bottom-0 h-[36%] bg-gradient-to-t from-panel via-panel to-panel/70"
                    ></span>
                    <span
                      class="pointer-events-none absolute inset-x-0 bottom-[36%] h-px bg-amber/20"
                    ></span>
                    <span class="absolute bottom-2 left-2 flex items-center gap-1 text-xs text-amber">
                      <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                        <path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.2l1.5 1.6h6.3A1.5 1.5 0 0 1 15 5.1v7.4A1.5 1.5 0 0 1 13.5 14h-11A1.5 1.5 0 0 1 1 12.5z" />
                      </svg>
                      {{ collection.itemCount }}
                    </span>
                  </div>
                </div>
              </a>
              <p class="mt-2 truncate text-sm">{{ collection.name }}</p>
            </li>
          }
          @for (item of visibleItems(); track item.id) {
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
                  } @else if (item.type === 'SERIES') {
                    <svg class="absolute right-2 top-0 h-10 w-4 text-dusk drop-shadow-md" viewBox="0 0 16 40" aria-hidden="true">
                      <rect width="16" height="40" fill="currentColor" />
                      <g fill="rgba(0, 0, 0, 0.45)">
                        <rect x="3" y="4" width="10" height="7" rx="1.5" />
                        <rect x="3" y="14" width="10" height="7" rx="1.5" />
                        <rect x="3" y="24" width="10" height="7" rx="1.5" />
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
                    class="rounded p-1 text-muted transition hover:text-amber focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    [attr.aria-label]="'Añadir ' + item.title + ' a una colección'"
                    title="Añadir a una colección"
                  >
                    ＋
                  </button>
                  <button
                    (click)="remove(item)"
                    class="rounded p-1 text-muted transition hover:text-rust focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    [attr.aria-label]="'Eliminar ' + item.title"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </li>
          }
        </ul>

        @if (page.totalPages > 1 && view() !== 'collections') {
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
      case 'SERIES':
        return 'Series';
      case 'BOOK':
        return 'Books';
      default:
        return '';
    }
  });
  /** Discover opens on the shelf you are browsing. */
  readonly suggestionsLink = computed(() => {
    switch (this.type()) {
      case 'SERIES':
        return '/suggestions/series';
      case 'BOOK':
        return '/suggestions/books';
      default:
        return '/suggestions/movies';
    }
  });
  readonly sort = signal<ItemSort>('recent');
  readonly status = signal<ItemStatus | ''>('');
  readonly q = signal('');

  // Which shelf the user is looking at, kept across reloads and route changes.
  private readonly viewKey = 'keepory.shelf.view';
  readonly view = signal<ShelfView>(this.readView());
  readonly viewOptions = computed(() => [
    { value: 'collections' as ShelfView, label: 'Colecciones' },
    { value: 'items' as ShelfView, label: this.itemsLabel() },
    { value: 'all' as ShelfView, label: 'Todo' },
  ]);
  private itemsLabel(): string {
    switch (this.type()) {
      case 'MOVIE':
        return 'Películas';
      case 'SERIES':
        return 'Series';
      case 'BOOK':
        return 'Libros';
      default:
        return 'Sueltos';
    }
  }

  readonly collectionId = signal<string | null>(null);
  readonly activeCollection = computed(() => {
    const id = this.collectionId();
    return id ? (this.collections.byId(id) ?? null) : null;
  });
  readonly result = signal<Page<Item> | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** Outside a collection an item shows once: inside its folder, never loose beside it. */
  readonly excludeCollected = computed(() => !this.collectionId());
  readonly shelfCollections = computed(() => {
    if (this.collectionId() || this.view() === 'items') return [];
    // Cards ride along with the first page only; paging counts items, not collections.
    if ((this.result()?.number ?? 0) > 0) return [];
    const all = this.collections.forType(this.type());
    // In the collections view the search box filters folders by name instead of titles.
    const needle = this.view() === 'collections' ? this.q().trim().toLowerCase() : '';
    return needle ? all.filter((c) => c.name.toLowerCase().includes(needle)) : all;
  });
  readonly visibleItems = computed(() =>
    this.view() === 'collections' && !this.collectionId() ? [] : (this.result()?.content ?? []),
  );
  readonly countLabel = computed(() => {
    const folders = this.shelfCollections().length;
    const total = this.result()?.totalElements ?? 0;
    if (this.view() === 'collections' && !this.collectionId()) {
      return `${folders} ${folders === 1 ? 'colección' : 'colecciones'}`;
    }
    if (!this.result()) return '';
    const items = `${total} ${this.collectionId() ? 'en la estantería' : 'sueltos'}`;
    return folders ? `${items} · ${folders} ${folders === 1 ? 'colección' : 'colecciones'}` : items;
  });
  readonly dropTarget = signal<string | null>(null);

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

    // A drop changes the screen when browsing that collection (the item arrives) or on
    // the shelf, where the item leaves as soon as it belongs somewhere.
    effect(() => {
      const drop = this.drag.dropped();
      if (!drop) return;
      const active = untracked(() => this.collectionId());
      if (drop.collectionId === active || untracked(() => this.excludeCollected())) this.load();
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
        excludeCollected: this.excludeCollected(),
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

  changeView(value: ShelfView): void {
    if (this.view() === value) return;
    this.view.set(value);
    this.page = 0;
    try {
      localStorage.setItem(this.viewKey, value);
    } catch {
      // Private mode without storage: the view just does not survive a reload.
    }
    this.load();
  }

  private readView(): ShelfView {
    try {
      const stored = localStorage.getItem(this.viewKey);
      return stored === 'collections' || stored === 'items' ? stored : 'all';
    } catch {
      return 'all';
    }
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

  /** A collection only takes items of its own type. */
  private acceptsDrag(collection: Collection): boolean {
    const item = this.drag.item();
    return !!item && collection.type === item.type;
  }

  onCollectionDragOver(event: DragEvent, collection: Collection): void {
    // Without preventDefault the browser refuses the drop, which is what we want
    // for a collection that does not accept the dragged type.
    if (!this.acceptsDrag(collection)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.dropTarget.set(collection.id);
  }

  onCollectionDragLeave(collection: Collection): void {
    if (this.dropTarget() === collection.id) this.dropTarget.set(null);
  }

  onCollectionDrop(event: DragEvent, collection: Collection): void {
    event.preventDefault();
    this.dropTarget.set(null);
    const item = this.drag.item();
    if (!item || !this.acceptsDrag(collection)) return;
    this.drag.end();
    this.collections.addItem(collection.id, item.id).subscribe({
      next: () => this.drag.dropOn(collection.id, item.id),
      error: () => this.error.set(`No se pudo añadir «${item.title}» a ${collection.name}.`),
    });
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
    // Membership may have changed, which moves the item in or out of what is shown.
    if (this.collectionId() || this.excludeCollected()) this.load();
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

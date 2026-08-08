import { HttpErrorResponse } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import {
  ActivatedRoute,
  IsActiveMatchOptions,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter } from 'rxjs';
import { AuthApi } from './auth/auth-api';
import { Collection, CollectionApi } from './collections/collection-api';
import { DragState } from './collections/drag-state';
import { ItemType } from './items/item.model';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: { '(document:keydown.escape)': 'closeDrawer()' },
})
export class App {
  private readonly collections = inject(CollectionApi);
  private readonly drag = inject(DragState);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthApi);

  // Drives the chrome: no user means the login screen renders on its own.
  readonly user = this.auth.user;

  readonly movieCollections = computed(() => this.collections.forType('MOVIE'));
  readonly seriesCollections = computed(() => this.collections.forType('SERIES'));
  readonly bookCollections = computed(() => this.collections.forType('BOOK'));

  // Long shelves are revealed 5 at a time instead of all at once.
  private readonly PAGE_SIZE = 5;
  private readonly visibleCounts = signal<Partial<Record<ItemType, number>>>({});

  // The sidebar is a slide-over below md:, part of the layout from md: up.
  readonly drawerOpen = signal(false);

  // The doorway has no shelf behind it: no sidebar, no hamburger, until a type is picked.
  private readonly url = signal(this.router.url);
  readonly onHome = computed(() => this.url().split('?')[0] === '/');

  // Sections the user folded away, kept across reloads.
  private readonly collapsedKey = 'keepory.sidebar.collapsed';
  private readonly collapsed = signal<ReadonlySet<ItemType>>(this.readCollapsed());

  // Collection currently under the pointer while dragging, and the last drop error.
  readonly dropTarget = signal<string | null>(null);
  readonly dropError = signal<string | null>(null);
  readonly draggedItem = this.drag.item;

  // Which section has its "new collection" input open, if any.
  readonly creatingFor = signal<ItemType | null>(null);
  readonly createError = signal<string | null>(null);
  // Guards against the double submit of Enter followed by blur on the same input.
  private readonly creating = signal(false);

  // Collection being renamed inline, if any.
  readonly renamingId = signal<string | null>(null);
  readonly renameError = signal<string | null>(null);
  private readonly renaming = signal(false);

  constructor() {
    // A new drag clears the error left by the previous one.
    effect(() => {
      if (this.draggedItem()) this.dropError.set(null);
    });
    // Picking a collection on a phone should reveal the shelf behind the drawer.
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((event) => {
      this.url.set(event.urlAfterRedirects);
      this.closeDrawer();
    });
  }

  toggleDrawer(): void {
    this.drawerOpen.update((open) => !open);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  // Query params take part in the match so "Películas" and one of its collections
  // are never highlighted at the same time.
  readonly exactMatch: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'exact',
    fragment: 'ignored',
    matrixParams: 'ignored',
  };

  logout(): void {
    // Navigate either way: a failed logout still means the user wants out.
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/login']),
      error: () => this.router.navigate(['/login']),
    });
  }

  isCollapsed(type: ItemType): boolean {
    return this.collapsed().has(type);
  }

  /** A collapsed section still opens mid-drag, or its collections could not be dropped on. */
  sectionOpen(type: ItemType): boolean {
    return !!this.draggedItem() || !this.isCollapsed(type);
  }

  visibleCount(type: ItemType): number {
    return this.visibleCounts()[type] ?? this.PAGE_SIZE;
  }

  visibleCollections(all: Collection[], type: ItemType): Collection[] {
    return all.slice(0, this.visibleCount(type));
  }

  showMore(type: ItemType): void {
    this.visibleCounts.update((counts) => ({ ...counts, [type]: this.visibleCount(type) + this.PAGE_SIZE }));
  }

  toggleSection(type: ItemType): void {
    const next = new Set(this.collapsed());
    if (!next.delete(type)) next.add(type);
    this.collapsed.set(next);
    // A folded section must not keep an input open that nobody can see.
    if (next.has(type)) {
      if (this.creatingFor() === type) this.cancelCreate();
      this.cancelRename();
    }
    try {
      localStorage.setItem(this.collapsedKey, JSON.stringify([...next]));
    } catch {
      // Private mode without storage: the fold just does not survive a reload.
    }
  }

  private readCollapsed(): ReadonlySet<ItemType> {
    try {
      const stored = localStorage.getItem(this.collapsedKey);
      return new Set(stored ? (JSON.parse(stored) as ItemType[]) : []);
    } catch {
      return new Set();
    }
  }

  startCreate(type: ItemType): void {
    this.creatingFor.set(type);
    this.createError.set(null);
    setTimeout(() => document.getElementById('new-collection-input')?.focus());
  }

  cancelCreate(): void {
    this.creatingFor.set(null);
    this.createError.set(null);
  }

  startRename(collection: Collection): void {
    this.renamingId.set(collection.id);
    this.renameError.set(null);
    setTimeout(() => {
      const input = document.getElementById('rename-collection-input') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  cancelRename(): void {
    this.renamingId.set(null);
    this.renameError.set(null);
  }

  renameCollection(collection: Collection, input: HTMLInputElement): void {
    if (this.renaming()) return;
    const name = input.value.trim();
    if (!name || name === collection.name) {
      this.cancelRename();
      return;
    }
    this.renameError.set(null);
    this.renaming.set(true);
    this.collections.rename(collection.id, name).subscribe({
      next: () => {
        this.renaming.set(false);
        this.renamingId.set(null);
      },
      error: (err: HttpErrorResponse) => {
        this.renaming.set(false);
        this.renameError.set(
          err.status === 409 ? 'Ya existe una colección con ese nombre en esta sección.' : 'No se pudo renombrar.',
        );
      },
    });
  }

  deleteCollection(collection: Collection): void {
    const message = `¿Borrar la colección «${collection.name}»? Los ${collection.itemCount} items que contiene no se borran.`;
    if (!confirm(message)) return;
    this.collections.delete(collection.id).subscribe({
      next: () => {
        // The filter in the URL would point at a collection that no longer exists.
        if (this.route.snapshot.queryParamMap.get('collection') === collection.id) {
          this.router.navigate([this.routeForType(collection.type)]);
        }
      },
      error: () => this.dropError.set(`No se pudo borrar ${collection.name}.`),
    });
  }

  private routeForType(type: ItemType | null): string {
    switch (type) {
      case 'MOVIE':
        return '/movies';
      case 'SERIES':
        return '/series';
      case 'BOOK':
        return '/books';
      default:
        return '/';
    }
  }

  /** A collection only takes items of its own type. */
  acceptsDrag(collection: Collection): boolean {
    const item = this.draggedItem();
    return !!item && collection.type === item.type;
  }

  onDragOver(event: DragEvent, collection: Collection): void {
    // Without preventDefault the browser refuses the drop, which is what we want
    // for a collection that does not accept the dragged type.
    if (!this.acceptsDrag(collection)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.dropTarget.set(collection.id);
  }

  onDragLeave(collection: Collection): void {
    if (this.dropTarget() === collection.id) this.dropTarget.set(null);
  }

  onDrop(event: DragEvent, collection: Collection): void {
    event.preventDefault();
    this.dropTarget.set(null);
    const item = this.draggedItem();
    if (!item || !this.acceptsDrag(collection)) return;
    this.drag.end();
    this.dropError.set(null);
    this.collections.addItem(collection.id, item.id).subscribe({
      next: () => this.drag.dropOn(collection.id, item.id),
      error: () => this.dropError.set(`No se pudo añadir «${item.title}» a ${collection.name}.`),
    });
  }

  createCollection(type: ItemType, input: HTMLInputElement): void {
    if (this.creating()) return;
    const name = input.value.trim();
    if (!name) {
      this.cancelCreate();
      return;
    }
    this.createError.set(null);
    this.creating.set(true);
    this.collections.create(name, type).subscribe({
      next: () => {
        input.value = '';
        this.creating.set(false);
        this.creatingFor.set(null);
      },
      error: (err: HttpErrorResponse) => {
        this.creating.set(false);
        this.createError.set(
          err.status === 409 ? 'Ya existe una colección con ese nombre en esta sección.' : 'No se pudo crear.',
        );
      },
    });
  }
}

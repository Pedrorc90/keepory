import { HttpErrorResponse } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { IsActiveMatchOptions, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Collection, CollectionApi } from './collections/collection-api';
import { DragState } from './collections/drag-state';
import { ItemType } from './items/item.model';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly collections = inject(CollectionApi);
  private readonly drag = inject(DragState);

  readonly movieCollections = computed(() => this.collections.forType('MOVIE'));
  readonly bookCollections = computed(() => this.collections.forType('BOOK'));

  // Collection currently under the pointer while dragging, and the last drop error.
  readonly dropTarget = signal<string | null>(null);
  readonly dropError = signal<string | null>(null);
  readonly draggedItem = this.drag.item;

  // Which section has its "new collection" input open, if any.
  readonly creatingFor = signal<ItemType | null>(null);
  readonly createError = signal<string | null>(null);
  // Guards against the double submit of Enter followed by blur on the same input.
  private readonly creating = signal(false);

  constructor() {
    // A new drag clears the error left by the previous one.
    effect(() => {
      if (this.draggedItem()) this.dropError.set(null);
    });
  }

  // Query params take part in the match so "Películas" and one of its collections
  // are never highlighted at the same time.
  readonly exactMatch: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'exact',
    fragment: 'ignored',
    matrixParams: 'ignored',
  };

  startCreate(type: ItemType): void {
    this.creatingFor.set(type);
    this.createError.set(null);
    setTimeout(() => document.getElementById('new-collection-input')?.focus());
  }

  cancelCreate(): void {
    this.creatingFor.set(null);
    this.createError.set(null);
  }

  /** A typed collection only takes its own item type; an untyped one takes anything. */
  acceptsDrag(collection: Collection): boolean {
    const item = this.draggedItem();
    return !!item && (collection.type === null || collection.type === item.type);
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
          err.status === 409 ? 'Ya existe una colección con ese nombre.' : 'No se pudo crear.',
        );
      },
    });
  }
}

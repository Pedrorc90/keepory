import { Injectable, signal } from '@angular/core';
import { Item } from '../items/item.model';

/** Carries the dragged item between the grid (source) and the sidebar (drop target). */
@Injectable({ providedIn: 'root' })
export class DragState {
  private readonly dragged = signal<Item | null>(null);
  private readonly lastDrop = signal<{ collectionId: string; itemId: string } | null>(null);

  readonly item = this.dragged.asReadonly();
  /** Set after a successful drop so a list filtered by that collection can reload. */
  readonly dropped = this.lastDrop.asReadonly();

  start(item: Item): void {
    this.dragged.set(item);
  }

  end(): void {
    this.dragged.set(null);
  }

  dropOn(collectionId: string, itemId: string): void {
    this.lastDrop.set({ collectionId, itemId });
  }
}

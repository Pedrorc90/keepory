export type ItemType = 'MOVIE' | 'BOOK';

export type ItemStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DROPPED';

export interface Item {
  id: string;
  type: ItemType;
  title: string;
  coverUrl: string | null;
  status: ItemStatus;
  rating: number | null;
  completedAt: string | null;
  notes: string | null;
  attributes: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ItemRequest {
  type: ItemType;
  title: string;
  coverUrl: string | null;
  status: ItemStatus;
  rating: number | null;
  completedAt: string | null;
  notes: string | null;
  attributes: Record<string, unknown>;
}

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export const TYPE_LABELS: Record<ItemType, string> = {
  MOVIE: 'Película',
  BOOK: 'Libro',
};

export const STATUS_LABELS: Record<ItemStatus, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completado',
  DROPPED: 'Abandonado',
};

export const STATUS_SPINE_CLASSES: Record<ItemStatus, string> = {
  PENDING: 'bg-muted',
  IN_PROGRESS: 'bg-amber',
  COMPLETED: 'bg-moss',
  DROPPED: 'bg-rust',
};

export const ITEM_TYPES = Object.keys(TYPE_LABELS) as ItemType[];

export const ITEM_STATUSES = Object.keys(STATUS_LABELS) as ItemStatus[];

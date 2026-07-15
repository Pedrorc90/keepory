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
  source: string | null;
  externalId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ItemRequest {
  id?: string;
  type: ItemType;
  title: string;
  coverUrl: string | null;
  status: ItemStatus;
  rating: number | null;
  completedAt: string | null;
  notes: string | null;
  attributes: Record<string, unknown>;
  source: string | null;
  externalId: string | null;
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

export interface AttributeField {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'list';
}

export const ATTRIBUTE_FIELDS: Record<ItemType, AttributeField[]> = {
  MOVIE: [
    { key: 'director', label: 'Dirección', kind: 'text' },
    { key: 'year', label: 'Año', kind: 'number' },
    { key: 'durationMinutes', label: 'Duración (min)', kind: 'number' },
    { key: 'genres', label: 'Géneros (separados por comas)', kind: 'list' },
    { key: 'originalTitle', label: 'Título original', kind: 'text' },
  ],
  BOOK: [
    { key: 'authors', label: 'Autores (separados por comas)', kind: 'list' },
    { key: 'year', label: 'Año', kind: 'number' },
    { key: 'pageCount', label: 'Páginas', kind: 'number' },
    { key: 'publisher', label: 'Editorial', kind: 'text' },
    { key: 'isbn', label: 'ISBN', kind: 'text' },
    { key: 'categories', label: 'Categorías (separadas por comas)', kind: 'list' },
  ],
};

export const ITEM_TYPES = Object.keys(TYPE_LABELS) as ItemType[];

export const ITEM_STATUSES = Object.keys(STATUS_LABELS) as ItemStatus[];

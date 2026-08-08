export type ItemType = 'MOVIE' | 'SERIES' | 'BOOK';

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
  SERIES: 'Serie',
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
    { key: 'year', label: 'Año', kind: 'number' },
    { key: 'durationMinutes', label: 'Duración (min)', kind: 'number' },
    { key: 'genres', label: 'Géneros (separados por comas)', kind: 'list' },
    { key: 'watchProviders', label: 'Dónde ver (separadas por comas)', kind: 'list' },
    { key: 'originalTitle', label: 'Título original', kind: 'text' },
  ],
  SERIES: [
    { key: 'creator', label: 'Creador', kind: 'text' },
    { key: 'year', label: 'Año de estreno', kind: 'number' },
    { key: 'seasons', label: 'Temporadas', kind: 'number' },
    { key: 'episodes', label: 'Episodios', kind: 'number' },
    { key: 'durationMinutes', label: 'Duración por episodio (min)', kind: 'number' },
    { key: 'genres', label: 'Géneros (separados por comas)', kind: 'list' },
    { key: 'watchProviders', label: 'Dónde ver (separadas por comas)', kind: 'list' },
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

export interface GenreChip {
  name: string;
  dotClass: string;
}

const GENRE_DOT_CLASSES = ['bg-amber', 'bg-moss', 'bg-rust', 'bg-muted'];

export function genreChips(value: unknown): GenreChip[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.map((raw) => {
    const name = String(raw).trim();
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    return { name, dotClass: GENRE_DOT_CLASSES[Math.abs(hash) % GENRE_DOT_CLASSES.length] };
  });
}

export interface ProviderBadge {
  name: string;
  icon: string | null;
}

const PROVIDER_ICONS: [prefix: string, file: string][] = [
  ['netflix', 'netflix'],
  ['amazon prime video', 'amazon-prime-video'],
  ['disney plus', 'disney-plus'],
  ['skyshowtime', 'skyshowtime'],
  ['movistar plus', 'movistar-plus'],
  ['atres', 'atres-player'],
  ['tivify', 'tivify'],
];

function providerIcon(name: string): string | null {
  const normalized = name.trim().toLowerCase();
  const match = PROVIDER_ICONS.find(([prefix]) => normalized.startsWith(prefix));
  return match ? `/providers/${match[1]}.jpg` : null;
}

export function providerBadges(value: unknown): ProviderBadge[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const badges: ProviderBadge[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const name = String(raw).trim();
    const icon = providerIcon(name);
    const key = icon ?? name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    badges.push({ name, icon });
  }
  return badges;
}

export const ITEM_TYPES = Object.keys(TYPE_LABELS) as ItemType[];

export const ITEM_STATUSES = Object.keys(STATUS_LABELS) as ItemStatus[];

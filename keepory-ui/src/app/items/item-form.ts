import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ItemApi } from './item-api';
import {
  ATTRIBUTE_FIELDS,
  AttributeField,
  ITEM_STATUSES,
  ITEM_TYPES,
  ItemRequest,
  ItemStatus,
  ItemType,
  STATUS_LABELS,
  TYPE_LABELS,
} from './item.model';
import { MetadataApi } from './metadata-api';
import { MetadataSearchResult } from './metadata.model';

@Component({
  selector: 'app-item-form',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-3xl">
      <h1 class="font-display text-3xl font-semibold">
        {{ id ? 'Editar elemento' : 'Añadir a la colección' }}
      </h1>

      @if (loadError()) {
        <p class="mt-6 rounded-md border border-rust/50 bg-rust/10 px-4 py-3 text-sm">
          {{ loadError() }}
          <a routerLink="/items" class="ml-2 underline">Volver a la colección</a>
        </p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="save()" class="mt-6 grid gap-6 md:grid-cols-[1fr_200px]">
          <div class="grid content-start gap-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="grid gap-1.5 text-sm">
                <span class="text-muted">Tipo</span>
                <select formControlName="type" class="rounded-md border border-line bg-panel px-3 py-2 focus:border-amber focus:outline-none">
                  @for (t of types; track t) {
                    <option [value]="t">{{ typeLabels[t] }}</option>
                  }
                </select>
              </label>
              <label class="grid gap-1.5 text-sm">
                <span class="text-muted">Estado</span>
                <select formControlName="status" class="rounded-md border border-line bg-panel px-3 py-2 focus:border-amber focus:outline-none">
                  @for (s of statuses; track s) {
                    <option [value]="s">{{ statusLabels[s] }}</option>
                  }
                </select>
              </label>
            </div>

            <div class="grid gap-1.5 text-sm">
              <span class="text-muted">Buscar metadata</span>
              <div class="flex gap-2">
                <input
                  [formControl]="searchControl"
                  (keydown.enter)="$event.preventDefault(); search()"
                  placeholder="Busca en TMDB / Google Books…"
                  class="min-w-0 flex-1 rounded-md border border-line bg-panel px-3 py-2 placeholder:text-muted focus:border-amber focus:outline-none"
                />
                <button
                  type="button"
                  (click)="search()"
                  [disabled]="searching()"
                  class="rounded-md border border-line px-4 py-2 text-sm transition enabled:hover:border-amber disabled:opacity-60"
                >
                  {{ searching() ? 'Buscando…' : 'Buscar' }}
                </button>
              </div>
              @if (searchError()) {
                <span class="text-xs text-rust">{{ searchError() }}</span>
              }
              @if (searchResults(); as results) {
                <ul class="mt-1 overflow-hidden rounded-md border border-line bg-panel">
                  @if (results.length === 0) {
                    <li class="px-3 py-2 text-xs text-muted">Sin resultados.</li>
                  }
                  @for (r of results; track r.externalId) {
                    <li class="border-b border-line last:border-b-0">
                      <button
                        type="button"
                        (click)="pick(r)"
                        class="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-ink/40"
                      >
                        <span class="block h-12 w-8 shrink-0 overflow-hidden rounded-sm bg-ink">
                          @if (r.coverUrl) {
                            <img [src]="r.coverUrl" alt="" class="h-full w-full object-cover" loading="lazy" />
                          }
                        </span>
                        <span class="min-w-0">
                          <span class="block truncate">{{ r.title }}@if (r.year) { <span class="text-muted">({{ r.year }})</span> }</span>
                          @if (r.description) {
                            <span class="block truncate text-xs text-muted">{{ r.description }}</span>
                          }
                        </span>
                      </button>
                    </li>
                  }
                </ul>
              }
            </div>

            <label class="grid gap-1.5 text-sm">
              <span class="text-muted">Título</span>
              <input
                formControlName="title"
                maxlength="255"
                placeholder="p. ej. Dune, El nombre del viento…"
                class="rounded-md border border-line bg-panel px-3 py-2 placeholder:text-muted focus:border-amber focus:outline-none"
              />
              @if (submitted() && form.controls.title.invalid) {
                <span class="text-xs text-rust">El título es obligatorio.</span>
              }
            </label>

            <label class="grid gap-1.5 text-sm">
              <span class="text-muted">URL de la carátula</span>
              <input
                formControlName="coverUrl"
                placeholder="https://…"
                class="rounded-md border border-line bg-panel px-3 py-2 placeholder:text-muted focus:border-amber focus:outline-none"
              />
            </label>

            <div class="grid gap-4 sm:grid-cols-2">
              <label class="grid gap-1.5 text-sm">
                <span class="text-muted">Nota</span>
                <select formControlName="rating" class="rounded-md border border-line bg-panel px-3 py-2 focus:border-amber focus:outline-none">
                  <option value="">Sin nota</option>
                  @for (r of ratings; track r) {
                    <option [value]="r">{{ starLabel(r) }}</option>
                  }
                </select>
              </label>
              <label class="grid gap-1.5 text-sm">
                <span class="text-muted">Completado el</span>
                <input
                  type="date"
                  formControlName="completedAt"
                  class="rounded-md border border-line bg-panel px-3 py-2 focus:border-amber focus:outline-none"
                />
              </label>
            </div>

            <div formGroupName="attrs" class="grid gap-4 sm:grid-cols-2">
              @for (f of attributeFields(); track f.key) {
                <label class="grid gap-1.5 text-sm">
                  <span class="text-muted">{{ f.label }}</span>
                  <input
                    [formControlName]="f.key"
                    [type]="f.kind === 'number' ? 'number' : 'text'"
                    class="rounded-md border border-line bg-panel px-3 py-2 focus:border-amber focus:outline-none"
                  />
                </label>
              }
            </div>

            <label class="grid gap-1.5 text-sm">
              <span class="text-muted">Notas</span>
              <textarea
                formControlName="notes"
                rows="4"
                placeholder="Impresiones, dónde lo dejaste, a quién se lo prestaste…"
                class="rounded-md border border-line bg-panel px-3 py-2 placeholder:text-muted focus:border-amber focus:outline-none"
              ></textarea>
            </label>

            @if (saveError()) {
              <p class="rounded-md border border-rust/50 bg-rust/10 px-4 py-3 text-sm">{{ saveError() }}</p>
            }

            <div class="mt-1 flex items-center gap-3">
              <button
                type="submit"
                [disabled]="saving()"
                class="rounded-md bg-amber px-5 py-2 text-sm font-medium text-ink transition enabled:hover:brightness-110 disabled:opacity-60"
              >
                {{ saving() ? 'Guardando…' : 'Guardar' }}
              </button>
              <a routerLink="/items" class="text-sm text-muted transition hover:text-paper">Cancelar</a>
            </div>
          </div>

          <div class="order-first md:order-none">
            <div class="aspect-2/3 w-40 overflow-hidden rounded-md bg-panel ring-1 ring-line md:w-full">
              @if (coverPreview(); as url) {
                <img [src]="url" alt="Vista previa de la carátula" class="h-full w-full object-cover" />
              } @else {
                <div class="flex h-full items-center justify-center p-4 text-center text-xs text-muted">
                  Sin carátula
                </div>
              }
            </div>
          </div>
        </form>
      }
    </div>
  `,
})
export class ItemForm {
  private readonly api = inject(ItemApi);
  private readonly metadata = inject(MetadataApi);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly id: string | null = inject(ActivatedRoute).snapshot.paramMap.get('id');

  readonly types = ITEM_TYPES;
  readonly statuses = ITEM_STATUSES;
  readonly typeLabels = TYPE_LABELS;
  readonly statusLabels = STATUS_LABELS;
  readonly ratings = [1, 2, 3, 4, 5];

  readonly attrsForm = this.fb.record<string>({});

  readonly form = this.fb.group({
    type: this.fb.control<ItemType>('MOVIE', Validators.required),
    title: ['', [Validators.required, Validators.maxLength(255)]],
    coverUrl: [''],
    status: this.fb.control<ItemStatus>('PENDING', Validators.required),
    rating: [''],
    completedAt: [''],
    notes: [''],
    attrs: this.attrsForm,
  });

  readonly searchControl = this.fb.control('');
  readonly searching = signal(false);
  readonly searchError = signal<string | null>(null);
  readonly searchResults = signal<MetadataSearchResult[] | null>(null);
  readonly attributeFields = signal<AttributeField[]>(ATTRIBUTE_FIELDS['MOVIE']);

  readonly coverPreview = toSignal(this.form.controls.coverUrl.valueChanges, { initialValue: '' });
  readonly submitted = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);

  private attributes: Record<string, unknown> = {};
  private source: string | null = null;
  private externalId: string | null = null;

  constructor() {
    this.rebuildAttrs();
    this.form.controls.type.valueChanges.subscribe(() => {
      this.searchResults.set(null);
      this.rebuildAttrs();
    });
    if (this.id) this.loadItem(this.id);
  }

  private loadItem(id: string): void {
    this.api.get(id).subscribe({
      next: (item) => {
        this.attributes = item.attributes ?? {};
        this.source = item.source;
        this.externalId = item.externalId;
        this.form.patchValue({
          type: item.type,
          title: item.title,
          coverUrl: item.coverUrl ?? '',
          status: item.status,
          rating: item.rating?.toString() ?? '',
          completedAt: item.completedAt ?? '',
          notes: item.notes ?? '',
        });
        this.rebuildAttrs();
      },
      error: () => this.loadError.set('No se pudo cargar el elemento.'),
    });
  }

  search(): void {
    const q = this.searchControl.value.trim() || this.form.controls.title.value.trim();
    if (!q) return;
    this.searching.set(true);
    this.searchError.set(null);
    this.metadata.search(this.form.controls.type.value, q).subscribe({
      next: (results) => {
        this.searchResults.set(results);
        this.searching.set(false);
      },
      error: () => {
        this.searchError.set('No se pudo buscar. ¿Está configurada la API key del proveedor?');
        this.searching.set(false);
      },
    });
  }

  pick(result: MetadataSearchResult): void {
    this.searching.set(true);
    this.searchError.set(null);
    this.metadata.detail(this.form.controls.type.value, result.externalId).subscribe({
      next: (detail) => {
        this.attributes = detail.attributes ?? {};
        this.source = detail.source;
        this.externalId = detail.externalId;
        this.form.patchValue({ title: detail.title, coverUrl: detail.coverUrl ?? '' });
        this.rebuildAttrs();
        this.searchResults.set(null);
        this.searching.set(false);
      },
      error: () => {
        this.searchError.set('No se pudo cargar el detalle del resultado.');
        this.searching.set(false);
      },
    });
  }

  private rebuildAttrs(): void {
    const fields = ATTRIBUTE_FIELDS[this.form.controls.type.value];
    this.attributeFields.set(fields);
    const attrs = this.attrsForm;
    for (const key of Object.keys(attrs.controls)) {
      attrs.removeControl(key, { emitEvent: false });
    }
    for (const field of fields) {
      const value = this.attributes[field.key];
      const text =
        field.kind === 'list' && Array.isArray(value)
          ? value.join(', ')
          : value != null
            ? String(value)
            : '';
      attrs.addControl(field.key, this.fb.control(text), { emitEvent: false });
    }
  }

  private serializeAttributes(): Record<string, unknown> {
    const out = { ...this.attributes };
    const attrs = this.attrsForm.getRawValue();
    for (const field of this.attributeFields()) {
      const raw = (attrs[field.key] ?? '').trim();
      if (!raw) {
        delete out[field.key];
        continue;
      }
      if (field.kind === 'number') {
        const n = Number(raw);
        out[field.key] = Number.isNaN(n) ? raw : n;
      } else if (field.kind === 'list') {
        out[field.key] = raw.split(',').map((s) => s.trim()).filter(Boolean);
      } else {
        out[field.key] = raw;
      }
    }
    return out;
  }

  starLabel(rating: number): string {
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  }

  save(): void {
    this.submitted.set(true);
    if (this.form.invalid) return;

    const value = this.form.getRawValue();
    const request: ItemRequest = {
      // Client-generated id so offline-created items keep the same identity after sync (F6).
      id: this.id ?? crypto.randomUUID(),
      type: value.type,
      title: value.title.trim(),
      coverUrl: value.coverUrl.trim() || null,
      status: value.status,
      rating: value.rating ? Number(value.rating) : null,
      completedAt: value.completedAt || null,
      notes: value.notes.trim() || null,
      attributes: this.serializeAttributes(),
      source: this.source,
      externalId: this.externalId,
    };

    this.saving.set(true);
    this.saveError.set(null);
    const call = this.id ? this.api.update(this.id, request) : this.api.create(request);
    call.subscribe({
      next: () => this.router.navigate(['/items']),
      error: (err: HttpErrorResponse) => {
        this.saveError.set(
          err.status === 409
            ? 'Este elemento ya está en tu colección.'
            : 'No se pudo guardar. Revisa los datos e inténtalo de nuevo.',
        );
        this.saving.set(false);
      },
    });
  }
}

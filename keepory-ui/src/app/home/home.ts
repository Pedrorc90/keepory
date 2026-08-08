import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthApi } from '../auth/auth-api';
import { CollectionApi } from '../collections/collection-api';

/** The doorway: every session picks a shelf here before seeing any collection. */
@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <section class="mx-auto flex max-w-4xl flex-col justify-center py-6 sm:py-12">
      <p class="font-display text-xs uppercase tracking-[0.25em] text-muted">
        {{ greeting() }}
      </p>
      <h1 class="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        ¿Qué estantería abres hoy<span class="text-amber">?</span>
      </h1>

      <div class="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-3 sm:gap-6">
        <a
          routerLink="/movies"
          class="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-panel/50 p-6 transition hover:border-rust/60 hover:bg-panel focus-visible:border-rust/60 focus-visible:outline-none sm:p-8"
        >
          <span
            class="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-rust/10 blur-2xl transition-opacity duration-300 group-hover:opacity-100 sm:opacity-0"
          ></span>
          <svg
            class="h-10 w-10 text-rust transition-transform duration-300 group-hover:-translate-y-0.5 sm:h-12 sm:w-12"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <rect x="1" y="2" width="14" height="12" rx="2" />
            <g fill="rgba(0, 0, 0, 0.45)">
              <rect x="2.75" y="3.75" width="2" height="2" rx="0.5" />
              <rect x="2.75" y="10.25" width="2" height="2" rx="0.5" />
              <rect x="11.25" y="3.75" width="2" height="2" rx="0.5" />
              <rect x="11.25" y="10.25" width="2" height="2" rx="0.5" />
            </g>
          </svg>
          <h2 class="mt-5 font-display text-2xl font-semibold tracking-tight sm:mt-6 sm:text-3xl">
            Películas
          </h2>
          <p class="mt-1.5 text-sm text-muted">{{ label(movieCount()) }}</p>
          <span class="mt-6 text-sm text-rust opacity-0 transition-opacity group-hover:opacity-100">
            Abrir →
          </span>
        </a>

        <a
          routerLink="/series"
          class="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-panel/50 p-6 transition hover:border-dusk/60 hover:bg-panel focus-visible:border-dusk/60 focus-visible:outline-none sm:p-8"
        >
          <span
            class="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-dusk/10 blur-2xl transition-opacity duration-300 group-hover:opacity-100 sm:opacity-0"
          ></span>
          <svg
            class="h-10 w-10 text-dusk transition-transform duration-300 group-hover:-translate-y-0.5 sm:h-12 sm:w-12"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M4.15 1.05 7.6 4.5l-.9.9L3.25 1.95z" />
            <path d="M11.85 1.05 8.4 4.5l.9.9 3.45-3.45z" />
            <rect x="1" y="4" width="14" height="11" rx="2" />
            <g fill="rgba(0, 0, 0, 0.45)">
              <rect x="2.5" y="5.5" width="9" height="8" rx="0.75" />
              <rect x="12.5" y="6" width="1.5" height="1.5" rx="0.4" />
              <rect x="12.5" y="8.5" width="1.5" height="1.5" rx="0.4" />
            </g>
          </svg>
          <h2 class="mt-5 font-display text-2xl font-semibold tracking-tight sm:mt-6 sm:text-3xl">
            Series
          </h2>
          <p class="mt-1.5 text-sm text-muted">{{ label(seriesCount()) }}</p>
          <span class="mt-6 text-sm text-dusk opacity-0 transition-opacity group-hover:opacity-100">
            Abrir →
          </span>
        </a>

        <a
          routerLink="/books"
          class="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-panel/50 p-6 transition hover:border-moss/60 hover:bg-panel focus-visible:border-moss/60 focus-visible:outline-none sm:p-8"
        >
          <span
            class="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-moss/10 blur-2xl transition-opacity duration-300 group-hover:opacity-100 sm:opacity-0"
          ></span>
          <svg
            class="h-10 w-10 text-moss transition-transform duration-300 group-hover:-translate-y-0.5 sm:h-12 sm:w-12"
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M3 1.5h10v13l-5-3.6-5 3.6z" />
          </svg>
          <h2 class="mt-5 font-display text-2xl font-semibold tracking-tight sm:mt-6 sm:text-3xl">
            Libros
          </h2>
          <p class="mt-1.5 text-sm text-muted">{{ label(bookCount()) }}</p>
          <span class="mt-6 text-sm text-moss opacity-0 transition-opacity group-hover:opacity-100">
            Abrir →
          </span>
        </a>
      </div>

      <a
        routerLink="/suggestions/movies"
        class="mt-8 self-start text-sm text-muted underline-offset-4 transition hover:text-amber hover:underline"
      >
        O deja que te sugiera algo →
      </a>
    </section>
  `,
})
export class Home {
  private readonly collections = inject(CollectionApi);
  private readonly auth = inject(AuthApi);

  readonly movieCount = computed(() => this.collections.forType('MOVIE').length);
  readonly seriesCount = computed(() => this.collections.forType('SERIES').length);
  readonly bookCount = computed(() => this.collections.forType('BOOK').length);

  greeting(): string {
    const name = this.auth.user()?.displayName?.trim();
    return name ? `Hola, ${name}` : 'Tu biblioteca';
  }

  label(count: number): string {
    if (count === 0) return 'Sin colecciones todavía';
    return count === 1 ? '1 colección' : `${count} colecciones`;
  }
}

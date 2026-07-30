import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthApi } from './auth-api';

@Component({
  selector: 'app-login',
  template: `
    <div class="flex min-h-[70dvh] items-center justify-center px-6">
      <div class="w-full max-w-sm">
        <h1 class="font-display text-4xl text-paper text-center">Keepory</h1>
        <p class="text-muted text-sm text-center mt-2 mb-8"></p>

        <form class="bg-panel border border-line rounded-lg p-6 space-y-4" (submit)="submit($event, email, password)">
          <label class="block">
            <span class="text-sm text-muted">Email</span>
            <input #email type="email" autocomplete="username" required autofocus
                   class="mt-1 w-full bg-ink border border-line rounded px-3 py-2 text-paper
                          focus:outline-none focus:border-amber" />
          </label>

          <label class="block">
            <span class="text-sm text-muted">Contraseña</span>
            <input #password type="password" autocomplete="current-password" required
                   class="mt-1 w-full bg-ink border border-line rounded px-3 py-2 text-paper
                          focus:outline-none focus:border-amber" />
          </label>

          @if (error()) {
            <p class="text-rust text-sm">{{ error() }}</p>
          }

          <button type="submit" [disabled]="busy()"
                  class="w-full bg-amber text-ink font-medium rounded px-3 py-2
                         hover:opacity-90 disabled:opacity-50">
            {{ busy() ? 'Entrando…' : 'Entrar' }}
          </button>
        </form>
      </div>
    </div>
  `,
})
export class Login {
  private readonly auth = inject(AuthApi);
  private readonly router = inject(Router);

  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  submit(event: Event, email: HTMLInputElement, password: HTMLInputElement): void {
    event.preventDefault();
    if (this.busy()) return;
    this.error.set(null);
    this.busy.set(true);
    this.auth.login(email.value.trim(), password.value).subscribe({
      next: () => this.router.navigate(['/items']),
      error: (err: HttpErrorResponse) => {
        this.busy.set(false);
        password.value = '';
        this.error.set(
          err.status === 401 ? 'Email o contraseña incorrectos.' : 'No se pudo conectar. Inténtalo de nuevo.',
        );
      },
    });
  }
}

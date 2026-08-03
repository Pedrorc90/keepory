import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, firstValueFrom, tap } from 'rxjs';

export interface User {
  id: string;
  email: string;
  displayName: string;
}

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/auth';

  private readonly state = signal<User | null>(null);
  readonly user = this.state.asReadonly();

  // The session is asked for once per page load; afterwards the signal is the truth.
  private resolved = false;

  /** Awaited by the guard, so the app never paints before knowing who is looking. */
  async ensureLoaded(): Promise<User | null> {
    if (this.resolved) return this.state();
    try {
      this.state.set(await firstValueFrom(this.http.get<User>(`${this.baseUrl}/me`)));
    } catch {
      // A 401 here is the normal "not logged in" answer, not a failure.
      this.state.set(null);
    }
    this.resolved = true;
    return this.state();
  }

  login(email: string, password: string, rememberMe: boolean): Observable<User> {
    return this.http.post<User>(`${this.baseUrl}/login`, { email, password, rememberMe }).pipe(
      tap((user) => {
        this.state.set(user);
        this.resolved = true;
      }),
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/logout`, {}).pipe(tap(() => this.clear()));
  }

  /** Also called by the interceptor when the server says the session is gone. */
  clear(): void {
    this.state.set(null);
    this.resolved = true;
  }
}

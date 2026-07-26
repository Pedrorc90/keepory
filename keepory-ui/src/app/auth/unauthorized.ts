import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthApi } from './auth-api';

/**
 * Catches the session expiring mid-use: any 401 outside /api/auth sends the user
 * back to the login screen instead of leaving a half-broken page behind.
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthApi);
  const router = inject(Router);
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      // /api/auth answers 401 by design (wrong password, no session yet).
      if (error.status === 401 && !req.url.startsWith('/api/auth/')) {
        auth.clear();
        router.navigate(['/login']);
      }
      return throwError(() => error);
    }),
  );
};

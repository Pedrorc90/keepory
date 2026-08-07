import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthApi } from './auth-api';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthApi);
  const router = inject(Router);
  // Awaiting here is what keeps the shelf from flashing before the redirect.
  return (await auth.ensureLoaded()) ? true : router.createUrlTree(['/login']);
};

/** The mirror image: someone already logged in has no business on /login. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthApi);
  const router = inject(Router);
  return (await auth.ensureLoaded()) ? router.createUrlTree(['/']) : true;
};

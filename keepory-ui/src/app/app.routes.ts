import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './auth/auth-guard';

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./auth/login').then((m) => m.Login) },
  // The doorway: no mixed shelf any more, you pick movies or books first.
  { path: '', pathMatch: 'full', canActivate: [authGuard], loadComponent: () => import('./home/home').then((m) => m.Home) },
  { path: 'movies', canActivate: [authGuard], loadComponent: () => import('./items/item-list').then((m) => m.ItemList), data: { type: 'MOVIE' } },
  { path: 'books', canActivate: [authGuard], loadComponent: () => import('./items/item-list').then((m) => m.ItemList), data: { type: 'BOOK' } },
  { path: 'items/new', canActivate: [authGuard], loadComponent: () => import('./items/item-form').then((m) => m.ItemForm) },
  { path: 'items/:id/edit', canActivate: [authGuard], loadComponent: () => import('./items/item-form').then((m) => m.ItemForm) },
  { path: 'suggestions', canActivate: [authGuard], loadComponent: () => import('./suggestions/suggestions').then((m) => m.Suggestions) },
  // Public on purpose: it has to be readable from the login screen, before there is a session.
  { path: 'privacidad', loadComponent: () => import('./legal/privacy').then((m) => m.Privacy) },
  { path: '**', redirectTo: '' },
];

import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './auth/auth-guard';

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./auth/login').then((m) => m.Login) },
  // The doorway: no mixed shelf any more, you pick movies or books first.
  { path: '', pathMatch: 'full', canActivate: [authGuard], loadComponent: () => import('./home/home').then((m) => m.Home) },
  { path: 'movies', canActivate: [authGuard], loadComponent: () => import('./items/item-list').then((m) => m.ItemList), data: { type: 'MOVIE' } },
  { path: 'series', canActivate: [authGuard], loadComponent: () => import('./items/item-list').then((m) => m.ItemList), data: { type: 'SERIES' } },
  { path: 'books', canActivate: [authGuard], loadComponent: () => import('./items/item-list').then((m) => m.ItemList), data: { type: 'BOOK' } },
  { path: 'games', canActivate: [authGuard], loadComponent: () => import('./items/item-list').then((m) => m.ItemList), data: { type: 'GAME' } },
  { path: 'items/new', canActivate: [authGuard], loadComponent: () => import('./items/item-form').then((m) => m.ItemForm) },
  { path: 'items/:id/edit', canActivate: [authGuard], loadComponent: () => import('./items/item-form').then((m) => m.ItemForm) },
  // The URL owns the type, so you land on the shelf you came from.
  { path: 'suggestions/movies', canActivate: [authGuard], loadComponent: () => import('./suggestions/suggestions').then((m) => m.Suggestions), data: { type: 'MOVIE' } },
  { path: 'suggestions/series', canActivate: [authGuard], loadComponent: () => import('./suggestions/suggestions').then((m) => m.Suggestions), data: { type: 'SERIES' } },
  { path: 'suggestions/books', canActivate: [authGuard], loadComponent: () => import('./suggestions/suggestions').then((m) => m.Suggestions), data: { type: 'BOOK' } },
  { path: 'suggestions/games', canActivate: [authGuard], loadComponent: () => import('./suggestions/suggestions').then((m) => m.Suggestions), data: { type: 'GAME' } },
  { path: 'suggestions', pathMatch: 'full', redirectTo: 'suggestions/movies' },
  // Public on purpose: it has to be readable from the login screen, before there is a session.
  { path: 'privacidad', loadComponent: () => import('./legal/privacy').then((m) => m.Privacy) },
  { path: '**', redirectTo: '' },
];

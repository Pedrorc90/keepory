import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'items' },
  { path: 'items', loadComponent: () => import('./items/item-list').then((m) => m.ItemList) },
  { path: 'movies', loadComponent: () => import('./items/item-list').then((m) => m.ItemList), data: { type: 'MOVIE' } },
  { path: 'books', loadComponent: () => import('./items/item-list').then((m) => m.ItemList), data: { type: 'BOOK' } },
  { path: 'items/new', loadComponent: () => import('./items/item-form').then((m) => m.ItemForm) },
  { path: 'items/:id/edit', loadComponent: () => import('./items/item-form').then((m) => m.ItemForm) },
  { path: 'suggestions', loadComponent: () => import('./suggestions/suggestions').then((m) => m.Suggestions) },
  { path: '**', redirectTo: 'items' },
];

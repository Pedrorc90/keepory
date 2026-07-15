# Keepory — Roadmap

Fuente de verdad del plan por fases. Claude lo lee al inicio de sesión y lo actualiza al cerrar cada fase.

## Fases

- [x] **F0 — Scaffolding** (2026-07-13): repo, docker-compose PostgreSQL 16
- [x] **F1 — CRUD API** (2026-07-14): item CRUD, búsqueda, paging, Flyway
- [x] **F2 — Panel Angular** (2026-07-14): grid de tarjetas con carátula, filtros tipo/estado/búsqueda, form alta/edición, tema oscuro "biblioteca de noche"
- [ ] **F3 — Metadata externa** (en curso, ver desglose abajo)
- [ ] **F4 — Sugerencias**
- [ ] **F5 — Auth + deploy**
- [ ] **F6 — Offline móvil** (Capacitor; offline-first, sync pull/push incremental por `updatedAt`, last-write-wins)

## F3 — Metadata externa (desglose)

- [x] **F3.1 — Preparación sync** (2026-07-14): UUID de cliente en POST con 409 si existe, soft delete `deleted_at`, `source` + `external_id` en item, migración V2. Nit de timestamps cerrado con saveAndFlush/flush en ItemService.
- [x] **F3.2 — Backend metadata + carátulas** (2026-07-14, revisada 2026-07-15): `GET /api/metadata/search` y `/detail`, TmdbClient es-ES + GoogleBooksClient. Nota Boot 4: RestClient requiere starter `spring-boot-starter-restclient`.
- [x] **F3.3 — Frontend buscador + attributes editable** (2026-07-15): buscador de metadata en el form (input + resultados con mini-cover, elegir rellena title/cover/attributes/source/externalId sobrescribiendo), campos de `attributes` fijos por tipo (`ATTRIBUTE_FIELDS` en item.model.ts; listas como texto separado por comas). Probado 2026-07-15: pelis OK; libros falla aún con key (ver bloqueos).

### Covers — decisión de diseño (cerrada 2026-07-15)

**Hotlink, sin espejo en servidor** (CoverStorage y WebConfig eliminados; `data/covers/` borrado):
- Pelis: CDN de TMDB (`image.tmdb.org/t/p/w500/...`) con atribución obligatoria en el footer de la UI
- Libros: Open Library por ISBN (`covers.openlibrary.org/b/isbn/<isbn>-L.jpg`); fallback al imageLink de Google Books si no hay ISBN (opción B)
- Motivo legal: descargar covers de Google Books va contra sus ToS; TMDB permite hotlink con atribución
- Offline móvil (F6): caché de imágenes en el cliente (Capacitor Filesystem) durante el sync — el servidor no interviene
- Riesgo aceptado: Open Library puede devolver imagen en blanco si no tiene el ISBN

## Bloqueos / notas

- **Búsqueda de libros sigue fallando** (2026-07-15): `GOOGLE_BOOKS_API_KEY` ya creada en Google Cloud pero las peticiones fallan — pendiente de depurar (¿key sin propagar al proceso, Books API no habilitada, restricciones de la key, o respuesta de error distinta?). Aparcado por decisión de Pedro.
- `TMDB_API_KEY` por variable de entorno (Pedro la tiene; no va en el repo).
- Attributes que devuelve metadata — pelis: director/durationMinutes/genres/year/originalTitle; libros: authors/pageCount/publisher/year/isbn/categories.
- **F3.1 y F3.2 están hechas pero sin commitear** (a 2026-07-15).

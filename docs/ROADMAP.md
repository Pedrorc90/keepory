# Keepory — Roadmap

Fuente de verdad del plan por fases. Claude lo lee al inicio de sesión y lo actualiza al cerrar cada fase.

## Fases

- [x] **F0 — Scaffolding** (2026-07-13): repo, docker-compose PostgreSQL 16
- [x] **F1 — CRUD API** (2026-07-14): item CRUD, búsqueda, paging, Flyway
- [x] **F2 — Panel Angular** (2026-07-14): grid de tarjetas con carátula, filtros tipo/estado/búsqueda, form alta/edición, tema oscuro "biblioteca de noche"
- [x] **F3 — Metadata externa** (cerrada 2026-07-23, ver desglose abajo)
- [x] **F4 — Sugerencias** (cerrada 2026-07-15; alcance: solo descubrimiento externo de películas en esta fase)
  - [x] **F4.1 — Descubrimiento de pelis** (2026-07-15, probada OK): pantalla `/suggestions` tipo baraja — cover + título/año/nota TMDB/sinopsis y acciones Pendiente / Ya la he visto / Descartar. Backend `GET /api/suggestions/movies` (semilla: hasta 5 completadas al azar → TMDB recommendations, excluye colección y descartes) y `POST /api/suggestions/dismiss` (tabla `suggestion_dismissal`, migración V3).
  - [ ] **F4.2 — Descubrimiento de libros** (implementado 2026-07-18, probado 2026-07-23: sigue fallando, ver bloqueos): toggle Pelis/Libros en `/suggestions`; `GET /api/suggestions/books` — semillas: libros completados → búsquedas `inauthor:`/`subject:` en español (langRestrict=es), dedupe por título normalizado, excluye colección y descartes.
  - [x] **F4.3 — Colecciones** (2026-07-26): agrupar items en colecciones con nombre y tipo opcional. Backend `/api/collections` (CRUD + add/remove item + set masivo por item), migración V5 (`collection` + `collection_item`), filtro `collectionId` en `GET /api/items`. UI: sidebar con las colecciones por tipo (los links de tipo se mueven del header al sidebar), crear inline, renombrar y borrar desde la fila (2026-07-26), arrastrar tarjeta sobre colección para añadir, picker en la tarjeta y chips en el form.
  - Ideas aplazadas: sugerencias desde la propia colección ("qué ver ahora"), redescubrimiento/estadísticas.
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

- **Búsqueda de libros sigue fallando** (actualizado 2026-07-23): se probó cambiar `GoogleBooksClient` al host `books.googleapis.com` (el legacy `www.googleapis.com` daba 503 `backendFailed` en ~40% de peticiones con key) + retry con backoff — sigue fallando. Pendiente de depurar más a fondo.
- **Deuda de F4.3 (colecciones)** (reducida 2026-07-26, probada OK): renombrar y borrar ya están en el sidebar (`PUT /api/collections/{id}`, confirm nativo al borrar) y el body null de `PUT /api/items/{id}/collections` ya no da 500. Queda: las colecciones sin tipo (`type` null) están soportadas en backend pero ninguna ruta de UI las crea — y si existieran saldrían duplicadas junto a una del mismo nombre con tipo, porque la unicidad es por `(lower(name), coalesce(type,''))` (V6); sin alternativa táctil al drag & drop más allá del picker.
- `TMDB_API_KEY` por variable de entorno (Pedro la tiene; no va en el repo).
- Attributes que devuelve metadata — pelis: director/durationMinutes/genres/year/originalTitle; libros: authors/pageCount/publisher/year/isbn/categories.

## Pendiente de decidir

- F4.2: ¿seguir depurando Google Books o cambiar de proveedor (Open Library como fuente de datos, no solo de covers)?
- F5: ¿auth propia (usuario único, sesión) o proveedor externo? ¿Dónde despliega — VPS propio o PaaS?

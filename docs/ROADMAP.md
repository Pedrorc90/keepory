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
- [x] **F5 — Auth + deploy** (cerrada 2026-07-27)
  - [x] **F5.1 — Deploy** (desplegado 2026-07-27 en https://keepory.onrender.com — verificado: SPA + API responden, 404 en `/api` inexistente, Flyway aplicó V1-V6 en Neon): Render free (Docker) + Neon (Postgres 16 free, Frankfurt) + Angular servido por el propio backend, un único origen. `Dockerfile` multi-stage (ng build → `resources/static` → jar → archivo CDS para recortar el arranque en frío), `render.yaml` con los secretos en `sync: false`, perfil `prod` (`PORT`, compresión, logging), `SpaFallbackConfig` para que las rutas de Angular sobrevivan a un F5. Datasource por `KEEPORY_DB_URL/USER/PASSWORD` — **sin `-pooler`** en el host de Neon: su PgBouncer va en modo transacción y Flyway toma un advisory lock de sesión.
  - [x] **F5.2 — Auth multiusuario** (2026-07-27, probada en local con dos cuentas cruzadas): decidido multiusuario con biblioteca **aislada** por usuario (los amigos entran a dar feedback, cada uno ve solo lo suyo) y **sin registro abierto** (las cuentas se crean a mano). Backend: `app_user` + Spring Security + sesión en Postgres (Spring Session JDBC, porque Render free duerme el contenedor), `POST /api/auth/login|logout` + `GET /me`, `UserSeeder` crea la cuenta owner desde `KEEPORY_ADMIN_EMAIL/PASSWORD/NAME`. Ownership: `user_id` en `item`, `collection` y `suggestion_dismissal` (V8, con backfill al owner), los índices únicos pasan a ser por usuario, y los servicios leen el dueño de `CurrentUser` — una fila ajena responde 404, nunca 403. UI: pantalla de login, `authGuard`/`guestGuard`, interceptor que vuelve a login en cualquier 401, cabecera con nombre y Salir.
    - CSRF deshabilitado a propósito: la defensa es la cookie `SameSite=Lax` + un solo origen (un POST cross-site no lleva cookie). Si algún día hay más orígenes, hay que activar el token.
    - Login en producción resuelto (2026-07-27): `UserSeeder` ahora sincroniza la contraseña del owner con `KEEPORY_ADMIN_PASSWORD` en cada arranque (commit 7cc1ea6), así que corregir la variable en Render basta para recuperar el acceso.
    - Pendiente: dar de alta a los amigos por `INSERT` en Neon (hash BCrypt generado a mano).
  - [x] **F5.3 — Migración de la biblioteca local a producción** (2026-07-27): 357 items (330 pelis, 27 libros) + 4 soft-deleted, 24 colecciones, 173 pertenencias y 221 descartes cargados en Neon; verificado en la UI de producción (2026-07-28). Método: `pg_dump --data-only --inserts` de las 4 tablas → staging (`stg_*`) → `INSERT ... SELECT` que resuelve el `user_id` por email del owner, en una transacción y con `ON CONFLICT DO NOTHING` (re-ejecutable). Ensayado antes contra una copia local del esquema con otro UUID de usuario.
  - [x] **F5.4 — Branding y layout móvil** (2026-07-28): `logo.png` y favicon nuevos commiteados (el header ya los referenciaba, así que producción servía una imagen rota), `apple-touch-icon` + `theme-color`. Sidebar de colecciones convertido en drawer por debajo de `md:` (hamburguesa en el header, cierre por backdrop/Escape/navegación) y acciones de tarjeta visibles sin hover en táctil.
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
- **Keep-alive de Render** (decidido 2026-07-28, sin implementar): monitor externo tipo UptimeRobot o cron-job.org con un `GET /` cada 10 min. Pegarle a `/` y no a un endpoint con DB, para no quemar las compute-hours de Neon — a cambio, la primera consulta tras 5 min de calma paga ~0,5 s de despertar a Neon. El free de Render da 750 h/mes de instancia: cabe un único servicio 24/7. Descartados: Starter de pago (7 $/mes) y GitHub Actions `schedule` (cron impuntual y se autodesactiva a los 60 días sin commits).

### Decisiones cerradas (para no reabrirlas)

- **Dónde despliega** (2026-07-26): Render + Neon, PaaS que Pedro ya conoce. Se descartó VPS único (~4,5 €/mes) por el mantenimiento, y GitHub Pages para la UI por el CORS/cookies cross-site que traería la auth.
- **Un solo repo** (2026-07-27): monorepo. El `Dockerfile` multi-stage mete el bundle de Angular dentro del jar y Render despliega un único servicio; separar repos obligaría a publicar el bundle como artefacto entre ellos.
- **Multiusuario con biblioteca aislada** (2026-07-27), no usuario único: los amigos van a usarla y dar feedback. Cuentas creadas a mano, sin registro abierto.
- **Desarrollo local contra datos reales: rama `dev` de Neon** (2026-07-28), no el Postgres de docker-compose ni `main`. Es una copia copy-on-write con endpoint y contraseña propios, así que una migración rota cuesta un *Reset from parent* en vez de producción. La arranca `run-neon.local.ps1` (gitignored) exportando `KEEPORY_DB_*`; host **sin** `-pooler` por el advisory lock de Flyway, y `KEEPORY_ADMIN_*` en blanco para que `UserSeeder` no toque la cuenta owner que la rama ya trae. La rama es una foto, no un espejo: no sigue a `main`.
- **Contraseñas de Neon rotadas** (2026-07-28), `main` y `dev` por separado: la de `main` se había pegado en un chat. Al rotar `main` hay que actualizar `KEEPORY_DB_PASSWORD` en Render (verificado ese día: `/api/items` responde 401 tras el redeploy). Una rama creada después de rotar hereda la contraseña del padre — hay que resetearla en la propia rama para que local no lleve la credencial de producción.

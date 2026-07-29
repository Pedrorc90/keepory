---
name: scaffold
description: Genera el esqueleto de un módulo nuevo en keepory siguiendo su arquitectura real (Spring Boot 4 backend, Angular 22 con signals). Propone el árbol y espera OK antes de crear nada. Usar cuando Pedro pida una feature, módulo o entidad nueva en keepory.
---

# scaffold — keepory

Stack real: **Spring Boot 4.0.7** (`keepory-backend`) + **Angular 22** (`keepory-ui`) + Postgres 16.
Módulos de referencia: `com.keepory.collection` (el más reciente) y `com.keepory.item`.

## Backend — paquete plano, sin subcarpetas de capa

`keepory-backend/src/main/java/com/keepory/<modulo>/`

```
<Modulo>.java              entity
<Modulo>Controller.java
<Modulo>Service.java       clase concreta — NO interfaz + impl
<Modulo>Repository.java
dto/<Modulo>Request.java   record + validación Jakarta
dto/<Modulo>Response.java  record + static from(entity, ...)
```

Convenciones que **no** se negocian, porque el repo ya las usa:

- **DTOs son `record`**, con anotaciones de validación Jakarta en los parámetros.
- **Mapeo manual**: método estático `from(entity, ...)` dentro del propio record. **No hay MapStruct.**
- **No hay wrapper `ApiResponse`**: el controller devuelve el DTO, `List<T>` o `Page<T>` directo.
- **Errores por `ProblemDetail`**, centralizados en `com/keepory/common/GlobalExceptionHandler.java` (`@RestControllerAdvice`). Lanza `EntityNotFoundException` (404), `EntityExistsException` (409), `IllegalArgumentException` (400). **No crees excepciones propias del módulo** salvo que haga falta un caso nuevo.
- **Entity**: `@Entity @Table(name="<snake_case>")`, `@Id` con UUID **asignado en el service** (no generado por la BD), `@CreationTimestamp` / `@UpdateTimestamp`.
- **Inyección por constructor, sin Lombok.**
- Enums de dominio como ficheros sueltos en el paquete (ver `ItemType.java`, `ItemStatus.java`).

**Flyway**: `keepory-backend/src/main/resources/db/migration/V<n>__<nombre>.sql`. Coge el siguiente `n` libre (van por V6). snake_case en tablas y columnas, FKs explícitas con `ON DELETE CASCADE`.

## UI — Angular 22

`keepory-ui/src/app/<modulo>/`

```
<modulo>-api.ts        servicio con el estado en signals
<modulo>-list.ts       solo si el dominio necesita pantalla propia
<modulo>-form.ts
```

- **Standalone components** (sin `standalone: true` explícito, es el default).
- **Estado con `signal` dentro del servicio API**, no NgRx: `private state = signal<T[]>([])` + `readonly all = state.asReadonly()`. Ver `collections/collection-api.ts:15-21`.
- **Rutas centralizadas** en `keepory-ui/src/app/app.routes.ts` con `loadComponent` lazy. **No** crees un fichero de rutas por feature.
- Ojo: **no todo dominio tiene componentes propios.** `collections/` solo tiene `collection-api.ts` y `drag-state.ts`; sus pantallas viven dentro de `items/`. Pregunta si el módulo nuevo necesita carpeta de componentes o solo servicio.

## Inconsistencias del repo — pregunta, no elijas

`item` y `collection` divergen en dos cosas. Cuando el módulo nuevo toque una de ellas, **presenta las dos opciones y espera**:

1. **Rutas.** `ItemController` usa `@RequestMapping("/api/items")` + subrutas relativas. `CollectionController` usa `@RequestMapping("/api")` con la ruta completa en cada método. El patrón de `item` es el más limpio.
2. **Paginación.** `ItemController.list` devuelve `Page<ItemResponse>`; `CollectionController.list` devuelve `List<CollectionResponse>` sin paginar.

## Formato de salida

Máximo 15 líneas más el árbol. Termina en `¿Procedo? (sí / ajusto algo)`. No crees ficheros antes del OK.

Genera solo esqueleto: firmas, wiring y TODOs. La lógica viene después, en trozos de <60s.

## Verificar

`./mvnw -q compile` en `keepory-backend` y `npm run build` en `keepory-ui` — delega a `checker`.

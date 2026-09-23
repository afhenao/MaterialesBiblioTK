# MaterialesBiblioTK — Servicio de material bibliográfico

Parte del sistema BiblioTK (ver `../CLAUDE.md`). Permite consultar y administrar la tabla `materiales` (libros, revistas y novelas del catálogo). Lo consume `BiblioTK-front-admin` (rol `admin`, bibliotecario).

- **Puerto:** 3004 (`PORT` en `.env`)
- **Arranque:** `npm run dev` (`node --watch src/app.js`). Solo levanta el servidor si `testConnection()` (un `SELECT 1`) funciona.
- **Dependencias clave:** express 5, mysql2, cookie-parser, jsonwebtoken, cors y dotenv
- **Variables (`.env`):** `PORT=3004`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` y `JWT_SECRET`. **`JWT_SECRET` debe ser el mismo de InicioSesionBiblioTK**: este servicio no emite tokens, solo verifica la cookie `token_acceso` para las escrituras.

## Estructura

- `src/app.js` — express + `cookieParser()` + CORS con `credentials: true` (GET, POST, PUT, DELETE) + router en `/MaterialesBiblioTK` + middleware de errores: JSON mal formado → 400; cualquier otro error → 500 con un mensaje genérico (el detalle solo sale por consola)
- `src/config/db.js` — pool mysql2 y `testConnection()` real
- `src/middlewares/verificarSesion.js` — igual que en PerfilBiblioTK: lee `token_acceso`, la verifica con `JWT_SECRET` y deja `req.sesion = { id, email, rol }`
- `src/middlewares/verificarRolAdmin.js` — corre después de `verificarSesion`; 403 si `req.sesion.rol !== "admin"`
- `src/router/routerBiblioTK.js`
- `src/controllers/materialesController.js` — `listarMateriales`, `obtenerMaterial`, `crearMaterial`, `actualizarMaterial`, `eliminarMaterial`

## Endpoints

| Método | Ruta | Auth | Respuesta |
|---|---|---|---|
| GET | `/MaterialesBiblioTK/health` | pública | `{ message }` |
| GET | `/MaterialesBiblioTK/Materiales` | **pública** | `{ materiales: [...] }`, ordenados por `titulo` |
| GET | `/MaterialesBiblioTK/Materiales/:id` | **pública** | `{ material }` o 404 |
| POST | `/MaterialesBiblioTK/Materiales` | sesión + rol `admin` | `{ message, material }` |
| PUT | `/MaterialesBiblioTK/Materiales/:id` | sesión + rol `admin` | `{ message, material }` |
| DELETE | `/MaterialesBiblioTK/Materiales/:id` | sesión + rol `admin` | `{ message }` |

Los GET son públicos a propósito: el futuro Catálogo necesita leer el material sin sesión (igual que `BackDashboardBiblioTK` ya expone `/Udashboard` sin autenticación). Las escrituras exigen `verificarSesion` + `verificarRolAdmin`; los errores de datos responden `{ campo, message }` para que el front marque el campo, igual que en `PerfilBiblioTK`.

### Body de POST/PUT `/Materiales`

`{ titulo, autor, tipoMaterial, editorial, anioPublicacion, isbn, disponible }` — camelCase en el body, columnas `snake_case` en la BD (mismo patrón de alias que `perfilController.js`). La tabla real (verificada con HeidiSQL) **no tiene columnas de conteo de ejemplares**: `disponible` es el único indicador de disponibilidad, un flag que pone a mano el bibliotecario por cada material.

### Validaciones (`validarMaterial`)

`titulo`/`autor` requeridos (máx. 200/150); `tipoMaterial` uno de `LIBRO`/`REVISTA`/`NOVELA`; `editorial` opcional (máx. 150); `anioPublicacion` entero entre 1400 y el año que viene; `isbn` opcional, solo dígitos y guiones (10–17 caracteres), y si viene se comprueba que no lo tenga ya otro material (409) — igual que `usuarios`, `materiales` tampoco tiene índices `UNIQUE`, la unicidad se comprueba en código.

### DELETE `/Materiales/:id`

Antes de borrar comprueba `prestamos` con `estado IN ('ACTIVO', 'VENCIDO')` para ese material y responde 409 si hay alguno (mismo patrón defensivo que `eliminarPerfil` en PerfilBiblioTK) — `prestamos.material_id` tiene `ON DELETE CASCADE`, así que sin este control se perdería historial de préstamos `DEVUELTO` en cuanto exista un servicio que escriba ahí.

## Problemas conocidos

- Los largos de columna (`VARCHAR`) siguen sin verificar contra el `CREATE TABLE` real (solo se confirmó la lista de columnas, no sus tipos exactos) — si `validarMaterial` rechaza algo que la BD sí aceptaría (o al revés), ajustar los límites.
- Es un repositorio git nuevo, todavía sin commits ni remoto.

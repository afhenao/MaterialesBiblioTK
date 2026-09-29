# MaterialesBiblioTK — Servicio de material bibliográfico

Parte del sistema BiblioTK (ver `../CLAUDE.md`). Permite consultar y administrar la tabla `materiales` (libros, revistas y novelas del catálogo) y sus portadas. Lo consumen `BiblioTK-front-admin` (rol `admin`, bibliotecario) para escribir, y `BiblioTK-front` / `BiblioTK-front-user` para leer el catálogo.

- **Puerto:** 3003 (`PORT` en `.env`)
- **Arranque:** `npm run dev` (`node --watch src/app.js`). Solo levanta el servidor si `testConnection()` funciona y `asegurarColumnasPortada()` pudo revisar/agregar las columnas de portada.
- **Dependencias clave:** express 5, mysql2, cookie-parser, jsonwebtoken, cors, dotenv, **multer** (subida de portadas) y **cloudinary** (copia remota opcional)
- **Variables (`.env`, ver `.env.example`):** `PORT=3003`, `DB_*`, `JWT_SECRET` (**el mismo de InicioSesionBiblioTK**: este servicio no emite tokens, solo verifica la cookie `token_acceso`), `ALLOWED_ORIGIN_*` (un origen por variable) y, opcionales, `CLOUDINARY_URL` **o** `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET`.

## Estructura

- `src/app.js` — express + `cookieParser()` + CORS (orígenes de `ALLOWED_ORIGIN_*`) + estáticos de portadas en `/MaterialesBiblioTK/uploads/materiales` (con `nosniff`) + router en `/MaterialesBiblioTK` + middleware de errores
- `src/config/db.js` — pool mysql2 y `testConnection()`
- `src/config/esquema.js` — agrega `imagen_local` e `imagen_url` a `materiales` si faltan (una sola vez, al arrancar)
- `src/config/cloudinary.js` — lee las credenciales; `cloudinaryActivo` es `false` si no hay
- `src/utils/portadas.js` — `recibirPortada` (multer: campo `imagen`, JPG/PNG/WEBP, máx. 3 MB), firma real del archivo, subida/borrado en Cloudinary y `conPortada` (URLs absolutas para la API)
- `src/middlewares/verificarSesion.js` / `verificarRolAdmin.js`
- `src/router/routerBiblioTK.js`
- `src/controllers/materialesController.js` — `listarMateriales`, `obtenerMaterial`, `crearMaterial`, `actualizarMaterial`, `eliminarMaterial`

## Endpoints

| Método | Ruta | Auth | Respuesta |
|---|---|---|---|
| GET | `/MaterialesBiblioTK/health` | pública | `{ message }` |
| GET | `/MaterialesBiblioTK/Materiales` | **pública** | `{ materiales: [...] }`, ordenados por `titulo` |
| GET | `/MaterialesBiblioTK/Materiales/:id` | **pública** | `{ material }` o 404 |
| POST | `/MaterialesBiblioTK/Materiales` | sesión + rol `admin` | `{ message, material, aviso? }` |
| PUT | `/MaterialesBiblioTK/Materiales/:id` | sesión + rol `admin` | `{ message, material, aviso? }` |
| DELETE | `/MaterialesBiblioTK/Materiales/:id` | sesión + rol `admin` | `{ message }` (también borra sus portadas) |
| GET | `/MaterialesBiblioTK/uploads/materiales/<archivo>` | pública | la portada local |

Cada material trae `imagenUrl` (copia remota o `null`) e `imagenLocal` (URL absoluta de la copia local, o `null` si no hay archivo).

### Body de POST/PUT `/Materiales`

JSON **o** `multipart/form-data` con los mismos campos: `{ titulo, autor, tipoMaterial, editorial, anioPublicacion, isbn, disponible, imagenUrl?, quitarImagen? }` y el archivo opcional en `imagen`. En multipart todo llega como texto: `disponible` acepta `"true"/"false"`.

## Portadas: local y Cloudinary a la vez

- **Subir archivo** (`imagen`): se guarda en `uploads/materiales/` (`imagen_local`, solo el nombre) y, si Cloudinary está configurado, también se sube a la carpeta `bibliotk/materiales` (`imagen_url`). Si Cloudinary falla, el guardado sigue y la respuesta trae `aviso`.
- **Pegar URL** (`imagenUrl`, http/https, máx. 500): queda como copia remota; si cambia por otra imagen, la copia local se borra. Vacía = se quita solo la remota.
- **`quitarImagen: true`** borra las dos copias.
- Las copias que dejan de usarse se borran después de guardar en la BD. De Cloudinary solo se borran imágenes subidas por este servicio (misma cuenta y carpeta).
- Los fronts intentan primero la copia remota y, si no carga, la local (`CoverImage.jsx`).

### Validaciones (`validarMaterial`)

Con los largos reales de la tabla: `titulo` (máx. 150) y `autor` (máx. 100) requeridos; `tipoMaterial` `LIBRO`/`REVISTA`/`NOVELA`; `editorial` opcional (máx. 100); `anioPublicacion` entero entre 1400 y el año que viene; `isbn` opcional, dígitos y guiones (10–17), único (409); `imagenUrl` http/https. El archivo se valida por su firma (no solo por el tipo que declara el navegador).

### DELETE `/Materiales/:id`

Antes de borrar comprueba `prestamos` con `estado IN ('ACTIVO', 'VENCIDO')` y responde 409 si hay alguno. Los préstamos `DEVUELTO` se borran en cascada, pero su historial queda en la tabla `reportes` (ver PrestamosBiblioTK).

## Problemas conocidos

- El enum real de `tipo_material` también tiene `ARTICULOS`, que este servicio y el front todavía no aceptan.
- `uploads/` no se sube al repositorio: cada integrante tiene sus copias locales; la copia compartida es la de Cloudinary.
- `disponible` lo cambian los préstamos (PrestamosBiblioTK) y también el bibliotecario a mano desde el formulario.

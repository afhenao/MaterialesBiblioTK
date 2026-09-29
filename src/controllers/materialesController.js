import pool from "../config/db.js";
import {
  borrarDeCloudinary,
  borrarPortadaLocal,
  conPortada,
  esImagenValida,
  mensajeImagenInvalida,
  subirACloudinary,
  validarImagenUrl,
} from "../utils/portadas.js";

const columnasMaterial = `id, titulo, autor, tipo_material AS tipoMaterial, editorial,
  anio_publicacion AS anioPublicacion, isbn, disponible, imagen_local AS imagenLocal,
  imagen_url AS imagenUrl, fecharegistro AS fechaRegistro`;

const tiposValidos = ["LIBRO", "REVISTA", "NOVELA"];
const patronIsbn = /^[0-9-]{10,17}$/;
const anioActual = new Date().getFullYear();

// Largo real de cada columna en la BD (titulo VARCHAR(150), autor y editorial VARCHAR(100))
const limites = { titulo: 150, autor: 100, editorial: 100 };

function comoTexto(valor) {
  return typeof valor === "string" || typeof valor === "number"
    ? String(valor).trim()
    : "";
}

function comoEntero(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.trunc(numero) : Number.NaN;
}

// Con multipart/form-data todo llega como texto: "false" también tiene que ser falso
function comoBooleano(valor) {
  if (typeof valor === "string") {
    return ["true", "1", "on"].includes(valor.trim().toLowerCase());
  }

  return Boolean(valor);
}

// conDefaults: true al crear (disponible = true si no llega); false al editar
function normalizarMaterial(datos = {}, { conDefaults }) {
  return {
    titulo: comoTexto(datos.titulo),
    autor: comoTexto(datos.autor),
    tipoMaterial: comoTexto(datos.tipoMaterial).toUpperCase(),
    editorial: comoTexto(datos.editorial),
    anioPublicacion: comoEntero(datos.anioPublicacion),
    isbn: comoTexto(datos.isbn),
    disponible:
      conDefaults && datos.disponible === undefined
        ? true
        : comoBooleano(datos.disponible),
    // undefined = el campo no vino (no se toca la portada); "" = se quita la URL
    imagenUrl:
      datos.imagenUrl === undefined ? undefined : comoTexto(datos.imagenUrl),
    quitarImagen: comoBooleano(datos.quitarImagen),
  };
}

// Mismas reglas que el formulario del front, mismo estilo que validarPerfil en PerfilBiblioTK
function validarMaterial(material) {
  if (!material.titulo || material.titulo.length > limites.titulo) {
    return {
      campo: "titulo",
      message: `El título es obligatorio y debe tener máximo ${limites.titulo} caracteres.`,
    };
  }

  if (!material.autor || material.autor.length > limites.autor) {
    return {
      campo: "autor",
      message: `El autor es obligatorio y debe tener máximo ${limites.autor} caracteres.`,
    };
  }

  if (!tiposValidos.includes(material.tipoMaterial)) {
    return {
      campo: "tipoMaterial",
      message: "El tipo de material debe ser LIBRO, REVISTA o NOVELA.",
    };
  }

  if (material.editorial && material.editorial.length > limites.editorial) {
    return {
      campo: "editorial",
      message: `La editorial debe tener máximo ${limites.editorial} caracteres.`,
    };
  }

  if (
    !Number.isInteger(material.anioPublicacion) ||
    material.anioPublicacion < 1400 ||
    material.anioPublicacion > anioActual + 1
  ) {
    return { campo: "anioPublicacion", message: "El año de publicación no es válido." };
  }

  if (material.isbn && !patronIsbn.test(material.isbn)) {
    return {
      campo: "isbn",
      message: "El ISBN debe contener solo números y guiones, entre 10 y 17 caracteres.",
    };
  }

  return validarImagenUrl(material.imagenUrl);
}

async function buscarFila(id) {
  const [filas] = await pool.query(
    `SELECT ${columnasMaterial} FROM materiales WHERE id = ? LIMIT 1`,
    [id],
  );
  return filas[0] ?? null;
}

async function isbnDuplicado(isbn, idExcluido) {
  const [filas] = await pool.query(
    "SELECT id FROM materiales WHERE isbn = ? AND id <> ? LIMIT 1",
    [isbn, idExcluido ?? 0],
  );
  return filas.length > 0;
}

// Antes de escribir en la BD: datos, archivo e ISBN. Devuelve { status, cuerpo } o null
async function revisarPeticion(material, archivo, idExcluido) {
  const errorValidacion = validarMaterial(material);

  if (errorValidacion) return { status: 400, cuerpo: errorValidacion };

  if (archivo && !(await esImagenValida(archivo))) {
    return { status: 400, cuerpo: { campo: "imagen", message: mensajeImagenInvalida } };
  }

  if (material.isbn && (await isbnDuplicado(material.isbn, idExcluido))) {
    return {
      status: 409,
      cuerpo: { campo: "isbn", message: "Ya existe un material registrado con ese ISBN." },
    };
  }

  return null;
}

// Archivo subido: copia local + copia en Cloudinary (si está configurado).
// Sin archivo: la URL que pegó el bibliotecario, si hay
async function portadaNueva(archivo, imagenUrl) {
  if (!archivo) {
    return { imagenLocal: null, imagenUrl: imagenUrl || null, subidaACloudinary: false };
  }

  const { url, aviso } = await subirACloudinary(archivo.path);
  return {
    imagenLocal: archivo.filename,
    imagenUrl: url,
    aviso,
    subidaACloudinary: Boolean(url),
  };
}

// Qué portada queda al editar, según lo que mandó el formulario
async function portadaActualizada(existente, material, archivo) {
  const actual = {
    imagenLocal: existente.imagenLocal,
    imagenUrl: existente.imagenUrl,
    subidaACloudinary: false,
  };

  if (archivo) return portadaNueva(archivo, null);

  if (material.quitarImagen) {
    return { imagenLocal: null, imagenUrl: null, subidaACloudinary: false };
  }

  const urlNueva = material.imagenUrl === undefined ? actual.imagenUrl : material.imagenUrl || null;

  if (urlNueva === (actual.imagenUrl || null)) return actual;

  // Otra URL es otra imagen: la copia local ya no corresponde.
  // URL vacía: solo se quita la copia remota y queda la local
  return {
    imagenLocal: urlNueva ? null : actual.imagenLocal,
    imagenUrl: urlNueva,
    subidaACloudinary: false,
  };
}

// Solo después de guardar en la BD se borran las copias que dejaron de usarse
async function limpiarPortadasViejas(anterior, actual) {
  if (anterior.imagenLocal && anterior.imagenLocal !== actual.imagenLocal) {
    await borrarPortadaLocal(anterior.imagenLocal);
  }

  if (anterior.imagenUrl && anterior.imagenUrl !== actual.imagenUrl) {
    await borrarDeCloudinary(anterior.imagenUrl);
  }
}

// Si algo falla después de recibir la portada, no quedan archivos huérfanos
async function descartarPortada(archivo, portada) {
  await borrarPortadaLocal(archivo?.filename);

  if (portada?.subidaACloudinary) {
    await borrarDeCloudinary(portada.imagenUrl);
  }
}

export async function listarMateriales(req, res, next) {
  try {
    const [materiales] = await pool.query(
      `SELECT ${columnasMaterial} FROM materiales ORDER BY titulo`,
    );
    return res.json({ materiales: materiales.map((fila) => conPortada(req, fila)) });
  } catch (error) {
    return next(error);
  }
}

export async function obtenerMaterial(req, res, next) {
  try {
    const material = await buscarFila(req.params.id);

    if (!material) {
      return res.status(404).json({ message: "No se encontró el material" });
    }

    return res.json({ material: conPortada(req, material) });
  } catch (error) {
    return next(error);
  }
}

export async function crearMaterial(req, res, next) {
  const archivo = req.file;
  let portada = null;

  try {
    const material = normalizarMaterial(req.body, { conDefaults: true });
    const problema = await revisarPeticion(material, archivo);

    if (problema) {
      await descartarPortada(archivo);
      return res.status(problema.status).json(problema.cuerpo);
    }

    portada = await portadaNueva(archivo, material.imagenUrl);

    const [resultado] = await pool.query(
      `INSERT INTO materiales
       (titulo, autor, tipo_material, editorial, anio_publicacion, isbn, disponible,
        imagen_local, imagen_url, fecharegistro)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        material.titulo,
        material.autor,
        material.tipoMaterial,
        material.editorial || null,
        material.anioPublicacion,
        material.isbn || null,
        material.disponible,
        portada.imagenLocal,
        portada.imagenUrl,
      ],
    );

    return res.status(201).json({
      message: "Material registrado",
      material: conPortada(req, await buscarFila(resultado.insertId)),
      aviso: portada.aviso,
    });
  } catch (error) {
    await descartarPortada(archivo, portada);
    return next(error);
  }
}

export async function actualizarMaterial(req, res, next) {
  const archivo = req.file;
  let portada = null;

  try {
    const existente = await buscarFila(req.params.id);

    if (!existente) {
      await descartarPortada(archivo);
      return res.status(404).json({ message: "No se encontró el material" });
    }

    const material = normalizarMaterial(req.body, { conDefaults: false });

    if (req.body?.disponible === undefined) {
      material.disponible = Boolean(existente.disponible);
    }

    const problema = await revisarPeticion(material, archivo, req.params.id);

    if (problema) {
      await descartarPortada(archivo);
      return res.status(problema.status).json(problema.cuerpo);
    }

    portada = await portadaActualizada(existente, material, archivo);

    await pool.query(
      `UPDATE materiales
       SET titulo = ?, autor = ?, tipo_material = ?, editorial = ?, anio_publicacion = ?,
           isbn = ?, disponible = ?, imagen_local = ?, imagen_url = ?
       WHERE id = ?`,
      [
        material.titulo,
        material.autor,
        material.tipoMaterial,
        material.editorial || null,
        material.anioPublicacion,
        material.isbn || null,
        material.disponible,
        portada.imagenLocal,
        portada.imagenUrl,
        req.params.id,
      ],
    );

    await limpiarPortadasViejas(existente, portada);

    return res.json({
      message: "Material actualizado",
      material: conPortada(req, await buscarFila(req.params.id)),
      aviso: portada.aviso,
    });
  } catch (error) {
    await descartarPortada(archivo, portada);
    return next(error);
  }
}

export async function eliminarMaterial(req, res, next) {
  try {
    const existente = await buscarFila(req.params.id);

    if (!existente) {
      return res.status(404).json({ message: "No se encontró el material" });
    }

    // prestamos.material_id tiene ON DELETE CASCADE: sin este control se perderían préstamos sin devolver
    const [[{ pendientes }]] = await pool.query(
      `SELECT COUNT(*) AS pendientes FROM prestamos
       WHERE material_id = ? AND estado IN ('ACTIVO', 'VENCIDO')`,
      [req.params.id],
    );

    if (Number(pendientes) > 0) {
      return res.status(409).json({
        message: "No se puede eliminar: hay préstamos de este material sin devolver.",
      });
    }

    await pool.query("DELETE FROM materiales WHERE id = ?", [req.params.id]);
    await limpiarPortadasViejas(existente, { imagenLocal: null, imagenUrl: null });

    return res.json({ message: "Material eliminado" });
  } catch (error) {
    return next(error);
  }
}

import pool from "../config/db.js";

const columnasMaterial = `id, titulo, autor, tipo_material AS tipoMaterial, editorial,
  anio_publicacion AS anioPublicacion, isbn, disponible, fecharegistro AS fechaRegistro`;

const tiposValidos = ["LIBRO", "REVISTA", "NOVELA"];
const patronIsbn = /^[0-9-]{10,17}$/;
const anioActual = new Date().getFullYear();

function comoTexto(valor) {
  return typeof valor === "string" || typeof valor === "number"
    ? String(valor).trim()
    : "";
}

function comoEntero(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.trunc(numero) : Number.NaN;
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
        : Boolean(datos.disponible),
  };
}

// Mismas reglas que el formulario del front, mismo estilo que validarPerfil en PerfilBiblioTK
function validarMaterial(material) {
  if (!material.titulo || material.titulo.length > 200) {
    return {
      campo: "titulo",
      message: "El título es obligatorio y debe tener máximo 200 caracteres.",
    };
  }

  if (!material.autor || material.autor.length > 150) {
    return {
      campo: "autor",
      message: "El autor es obligatorio y debe tener máximo 150 caracteres.",
    };
  }

  if (!tiposValidos.includes(material.tipoMaterial)) {
    return {
      campo: "tipoMaterial",
      message: "El tipo de material debe ser LIBRO, REVISTA o NOVELA.",
    };
  }

  if (material.editorial && material.editorial.length > 150) {
    return {
      campo: "editorial",
      message: "La editorial debe tener máximo 150 caracteres.",
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

  return null;
}

async function buscarMaterial(id) {
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

export async function listarMateriales(_req, res, next) {
  try {
    const [materiales] = await pool.query(
      `SELECT ${columnasMaterial} FROM materiales ORDER BY titulo`,
    );
    return res.json({ materiales });
  } catch (error) {
    return next(error);
  }
}

export async function obtenerMaterial(req, res, next) {
  try {
    const material = await buscarMaterial(req.params.id);

    if (!material) {
      return res.status(404).json({ message: "No se encontró el material" });
    }

    return res.json({ material });
  } catch (error) {
    return next(error);
  }
}

export async function crearMaterial(req, res, next) {
  try {
    const material = normalizarMaterial(req.body, { conDefaults: true });
    const errorValidacion = validarMaterial(material);

    if (errorValidacion) {
      return res.status(400).json(errorValidacion);
    }

    if (material.isbn && (await isbnDuplicado(material.isbn))) {
      return res.status(409).json({
        campo: "isbn",
        message: "Ya existe un material registrado con ese ISBN.",
      });
    }

    const [resultado] = await pool.query(
      `INSERT INTO materiales
       (titulo, autor, tipo_material, editorial, anio_publicacion, isbn, disponible, fecharegistro)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        material.titulo,
        material.autor,
        material.tipoMaterial,
        material.editorial || null,
        material.anioPublicacion,
        material.isbn || null,
        material.disponible,
      ],
    );

    return res.status(201).json({
      message: "Material registrado",
      material: await buscarMaterial(resultado.insertId),
    });
  } catch (error) {
    return next(error);
  }
}

export async function actualizarMaterial(req, res, next) {
  try {
    const existente = await buscarMaterial(req.params.id);

    if (!existente) {
      return res.status(404).json({ message: "No se encontró el material" });
    }

    const material = normalizarMaterial(req.body, { conDefaults: false });

    if (req.body.disponible === undefined) {
      material.disponible = Boolean(existente.disponible);
    }

    const errorValidacion = validarMaterial(material);

    if (errorValidacion) {
      return res.status(400).json(errorValidacion);
    }

    if (material.isbn && (await isbnDuplicado(material.isbn, req.params.id))) {
      return res.status(409).json({
        campo: "isbn",
        message: "Ya existe un material registrado con ese ISBN.",
      });
    }

    await pool.query(
      `UPDATE materiales
       SET titulo = ?, autor = ?, tipo_material = ?, editorial = ?, anio_publicacion = ?,
           isbn = ?, disponible = ?
       WHERE id = ?`,
      [
        material.titulo,
        material.autor,
        material.tipoMaterial,
        material.editorial || null,
        material.anioPublicacion,
        material.isbn || null,
        material.disponible,
        req.params.id,
      ],
    );

    return res.json({
      message: "Material actualizado",
      material: await buscarMaterial(req.params.id),
    });
  } catch (error) {
    return next(error);
  }
}

export async function eliminarMaterial(req, res, next) {
  try {
    const existente = await buscarMaterial(req.params.id);

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

    return res.json({ message: "Material eliminado" });
  } catch (error) {
    return next(error);
  }
}

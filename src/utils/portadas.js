import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { open, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import cloudinary, { cloudinaryActivo } from "../config/cloudinary.js";

// Cada portada puede tener dos copias a la vez:
// - local: archivo en uploads/materiales (columna imagen_local, solo el nombre del archivo)
// - remota: URL de Cloudinary u otra URL pegada a mano (columna imagen_url)
// El front intenta primero la remota y, si falla, la local.

export const carpetaPortadas = fileURLToPath(
  new URL("../../uploads/materiales", import.meta.url),
);
export const rutaPublicaPortadas = "/MaterialesBiblioTK/uploads/materiales";

const carpetaCloudinary = "bibliotk/materiales";
const pesoMaximo = 3 * 1024 * 1024;
const extensionesPorTipo = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export const mensajeImagenInvalida =
  "La portada debe ser una imagen JPG, PNG o WEBP.";

mkdirSync(carpetaPortadas, { recursive: true });

const subida = multer({
  storage: multer.diskStorage({
    destination: carpetaPortadas,
    filename: (_req, archivo, cb) => {
      cb(null, `${Date.now()}-${randomUUID()}${extensionesPorTipo[archivo.mimetype]}`);
    },
  }),
  limits: { fileSize: pesoMaximo, files: 1 },
  fileFilter: (_req, archivo, cb) => {
    if (extensionesPorTipo[archivo.mimetype]) return cb(null, true);

    const error = new Error(mensajeImagenInvalida);
    error.campo = "imagen";
    return cb(error);
  },
});

const mensajesMulter = {
  LIMIT_FILE_SIZE: "La portada debe pesar máximo 3 MB.",
  LIMIT_FILE_COUNT: "Solo se puede subir una portada por material.",
  LIMIT_UNEXPECTED_FILE: "La portada debe enviarse en el campo «imagen».",
};

// Acepta multipart/form-data con el archivo opcional "imagen"; si el cuerpo es JSON no hace nada
export function recibirPortada(req, res, next) {
  subida.single("imagen")(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      return res.status(400).json({
        campo: "imagen",
        message: mensajesMulter[error.code] ?? "No se pudo recibir la portada.",
      });
    }

    if (error.campo === "imagen") {
      return res.status(400).json({ campo: "imagen", message: error.message });
    }

    return next(error);
  });
}

const firmas = {
  ".jpg": (cabecera) =>
    cabecera[0] === 0xff && cabecera[1] === 0xd8 && cabecera[2] === 0xff,
  ".png": (cabecera) =>
    cabecera
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  ".webp": (cabecera) =>
    cabecera.toString("ascii", 0, 4) === "RIFF" &&
    cabecera.toString("ascii", 8, 12) === "WEBP",
};

// El tipo que declara el navegador se puede falsear: se comprueba la firma real del archivo
export async function esImagenValida(archivo) {
  const descriptor = await open(archivo.path, "r");

  try {
    const { buffer, bytesRead } = await descriptor.read(Buffer.alloc(12), 0, 12, 0);
    const cabecera = buffer.subarray(0, bytesRead);
    return Boolean(firmas[path.extname(archivo.filename)]?.(cabecera));
  } finally {
    await descriptor.close();
  }
}

export function validarImagenUrl(valor) {
  if (!valor) return null;

  const errorUrl = {
    campo: "imagenUrl",
    message: "Ingresa una URL válida que empiece por https://",
  };

  if (valor.length > 500) {
    return {
      campo: "imagenUrl",
      message: "La URL de la portada debe tener máximo 500 caracteres.",
    };
  }

  try {
    const url = new URL(valor);
    return url.protocol === "https:" || url.protocol === "http:" ? null : errorUrl;
  } catch {
    return errorUrl;
  }
}

// Copia en Cloudinary del archivo recién subido. Si no está configurado o falla,
// la portada queda solo en local y se avisa, pero el guardado no se cae
export async function subirACloudinary(rutaArchivo) {
  if (!cloudinaryActivo) return { url: null };

  try {
    const resultado = await cloudinary.uploader.upload(rutaArchivo, {
      folder: carpetaCloudinary,
      resource_type: "image",
      timeout: 20000,
    });
    return { url: resultado.secure_url };
  } catch (error) {
    console.error("No se pudo subir la portada a Cloudinary:", error?.message ?? error);
    return {
      url: null,
      aviso: "La portada se guardó en el servidor, pero no se pudo copiar a Cloudinary.",
    };
  }
}

// Solo nombres de archivo (basename): la columna nunca debe poder apuntar fuera de la carpeta
function rutaLocal(nombreArchivo) {
  return path.join(carpetaPortadas, path.basename(nombreArchivo));
}

export async function borrarPortadaLocal(nombreArchivo) {
  if (!nombreArchivo) return;
  await unlink(rutaLocal(nombreArchivo)).catch(() => undefined);
}

const patronCloudinaryPropio = new RegExp(
  `^https://res\\.cloudinary\\.com/([^/]+)/image/upload/(?:v\\d+/)?(${carpetaCloudinary}/[^/.]+)\\.\\w+$`,
);

// Solo se borran imágenes que subió este servicio (misma cuenta y carpeta):
// una URL pegada a mano, aunque sea de Cloudinary, no se toca
export async function borrarDeCloudinary(url) {
  if (!cloudinaryActivo || !url) return;

  const coincidencia = patronCloudinaryPropio.exec(url);

  if (!coincidencia || coincidencia[1] !== cloudinary.config().cloud_name) return;

  try {
    await cloudinary.uploader.destroy(coincidencia[2], {
      resource_type: "image",
      invalidate: true,
    });
  } catch (error) {
    console.error("No se pudo borrar la portada de Cloudinary:", error?.message ?? error);
  }
}

// La API devuelve URLs absolutas: el front no necesita saber dónde vive cada copia
export function conPortada(req, fila) {
  const { imagenLocal, imagenUrl, ...material } = fila;
  const existeLocal = Boolean(imagenLocal) && existsSync(rutaLocal(imagenLocal));

  return {
    ...material,
    imagenUrl: imagenUrl || null,
    imagenLocal: existeLocal
      ? `${req.protocol}://${req.get("host")}${rutaPublicaPortadas}/${encodeURIComponent(path.basename(imagenLocal))}`
      : null,
  };
}

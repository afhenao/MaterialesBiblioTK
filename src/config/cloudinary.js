import "dotenv/config";
import cloudinaryPkg from "cloudinary";

const cloudinary = cloudinaryPkg.v2;

// Admite CLOUDINARY_URL (cloudinary://api_key:api_secret@cloud_name) o las tres variables sueltas
function leerCredenciales() {
  const {
    CLOUDINARY_URL,
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
  } = process.env;

  if (CLOUDINARY_URL) {
    try {
      const url = new URL(CLOUDINARY_URL);
      return {
        cloud_name: url.hostname,
        api_key: decodeURIComponent(url.username),
        api_secret: decodeURIComponent(url.password),
      };
    } catch {
      console.error("CLOUDINARY_URL no tiene un formato válido: se ignora Cloudinary");
      return null;
    }
  }

  if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
    return {
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
    };
  }

  return null;
}

const credenciales = leerCredenciales();

// Cloudinary es opcional: sin credenciales las portadas se guardan solo en local
export const cloudinaryActivo = Boolean(credenciales);

if (credenciales) {
  cloudinary.config({ ...credenciales, secure: true });
}

export default cloudinary;

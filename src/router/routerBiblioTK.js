import { Router } from "express";
import {
  actualizarMaterial,
  crearMaterial,
  eliminarMaterial,
  listarMateriales,
  obtenerMaterial,
} from "../controllers/materialesController.js";
import { verificarRolAdmin } from "../middlewares/verificarRolAdmin.js";
import { verificarSesion } from "../middlewares/verificarSesion.js";
import { recibirPortada } from "../utils/portadas.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.status(200).json({ message: "Servicio de materiales activo" });
});

// Lectura pública: el catálogo debe poder consultarse sin sesión
router.get("/Materiales", listarMateriales);
router.get("/Materiales/:id", obtenerMaterial);

// Escritura solo para el bibliotecario (rol admin). Aceptan JSON o multipart/form-data
// con la portada en el campo "imagen" (recibirPortada va después de la sesión:
// nadie sin permiso llega a escribir un archivo en disco)
router.post(
  "/Materiales",
  verificarSesion,
  verificarRolAdmin,
  recibirPortada,
  crearMaterial,
);
router.put(
  "/Materiales/:id",
  verificarSesion,
  verificarRolAdmin,
  recibirPortada,
  actualizarMaterial,
);
router.delete("/Materiales/:id", verificarSesion, verificarRolAdmin, eliminarMaterial);

export default router;

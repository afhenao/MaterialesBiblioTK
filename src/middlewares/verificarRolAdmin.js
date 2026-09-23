// Va después de verificarSesion: solo el bibliotecario (rol admin) puede modificar el catálogo
export function verificarRolAdmin(req, res, next) {
  if (req.sesion?.rol !== "admin") {
    return res.status(403).json({
      message: "Solo un bibliotecario puede modificar el material bibliográfico.",
    });
  }

  return next();
}

import cookieParser from "cookie-parser";
import cors from "cors";
import "dotenv/config";
import express from "express";
import { testConnection } from "./config/db.js";
import { asegurarColumnasPortada } from "./config/esquema.js";
import routerBiblioTK from "./router/routerBiblioTK.js";
import { carpetaPortadas, rutaPublicaPortadas } from "./utils/portadas.js";

const app = express();
const puerto = Number(process.env.PORT) || 3003;

app.use(express.json());
app.use(cookieParser());

const allowedOrigins = Object.entries(process.env)
  .filter(([key, value]) => key.startsWith('ALLOWED_ORIGIN_') && value)
  .map(([, origin]) => origin.trim());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);;

// Portadas guardadas en local. nosniff: el navegador no puede tratarlas como otra cosa que imagen
app.use(
  rutaPublicaPortadas,
  express.static(carpetaPortadas, {
    maxAge: "7d",
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  }),
);

app.use("/MaterialesBiblioTK", routerBiblioTK);

// Los detalles del error se quedan en la consola: al cliente solo le llega un mensaje genérico
app.use((error, _req, res, _next) => {
  if (error.type === "entity.parse.failed") {
    return res
      .status(400)
      .json({ message: "El cuerpo de la solicitud no es un JSON válido" });
  }

  console.error("Error del servidor:", error);
  return res.status(500).json({ message: "Error interno del servidor" });
});

async function iniciarServidor() {
  try {
    await testConnection();
    await asegurarColumnasPortada();
    app.listen(puerto, () => {
      console.log(`Servicio de materiales corriendo en el puerto ${puerto}`);
    });
  } catch {
    process.exitCode = 1;
  }
}

iniciarServidor();

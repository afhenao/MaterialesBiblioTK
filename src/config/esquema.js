import pool from "./db.js";

// Columnas de la portada. La BD de cada integrante puede no tenerlas todavía:
// se agregan solas al arrancar, una sola vez
const columnasPortada = [
  {
    nombre: "imagen_local",
    definicion: "VARCHAR(255) NULL DEFAULT NULL AFTER isbn",
  },
  {
    nombre: "imagen_url",
    definicion: "VARCHAR(500) NULL DEFAULT NULL AFTER imagen_local",
  },
];

export async function asegurarColumnasPortada() {
  try {
    const [existentes] = await pool.query(
      `SELECT COLUMN_NAME AS nombre FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'materiales'`,
    );
    const nombres = new Set(existentes.map((fila) => fila.nombre));

    for (const columna of columnasPortada) {
      if (!nombres.has(columna.nombre)) {
        await pool.query(
          `ALTER TABLE materiales ADD COLUMN ${columna.nombre} ${columna.definicion}`,
        );
        console.log(`Columna materiales.${columna.nombre} agregada`);
      }
    }
  } catch (error) {
    console.error("No se pudieron preparar las columnas de portada:", error.message);
    throw error;
  }
}

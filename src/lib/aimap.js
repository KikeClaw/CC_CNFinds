// Fallback con IA: cuando ni la detección de bloques ni las URLs sirven, Claude
// mira la cabecera + filas de ejemplo y devuelve QUÉ columna es id/nombre/precio.
import { structured, MODELS } from "./ai.js";

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    header_row: { type: ["integer", "null"] },
    id_col: { type: ["integer", "null"] },
    name_col: { type: ["integer", "null"] },
    price_col: { type: ["integer", "null"] },
    platform: { type: ["string", "null"] },
  },
  required: ["header_row", "id_col", "name_col", "price_col", "platform"],
};

export async function mapColumnsAI(rows) {
  const sample = rows.slice(0, 14)
    .map((r, i) => `${i}: ${(r || []).slice(0, 14).map((c) => String(c ?? "").slice(0, 22)).join(" | ")}`)
    .join("\n");
  const system =
    "Recibes las primeras filas de una hoja de productos W2C/reps. Identifica por " +
    "ÍNDICE de columna (0-based): id_col = el itemID (número largo del producto), " +
    "name_col = el nombre, price_col = el precio. platform = weidian|taobao|1688 si " +
    "se deduce, si no null. header_row = índice de la fila de cabeceras (o null). " +
    "Usa null para lo que no exista.";
  return structured({ system, prompt: `Filas:\n${sample}\n\nDevuelve el mapeo.`, schema: SCHEMA, model: MODELS.fast, maxTokens: 200 });
}

export function candidatesFromMap(rows, map) {
  const out = [];
  const start = map.header_row != null ? map.header_row + 1 : 0;
  for (const cells of rows.slice(start)) {
    const idRaw = map.id_col != null ? cells[map.id_col] : null;
    const id = idRaw ? String(idRaw).replace(/\D/g, "") : "";
    if (id.length < 6) continue;
    const name = map.name_col != null ? String(cells[map.name_col] || "").trim() : null;
    const priceRaw = map.price_col != null ? String(cells[map.price_col] || "") : "";
    const pm = priceRaw.match(/(\d+[.,]\d{1,2})/);
    out.push({ platform: map.platform || "weidian", itemId: id, name, price: pm ? parseFloat(pm[1].replace(",", ".")) : null, image: null });
  }
  return out;
}

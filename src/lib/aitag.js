// Etiquetado de un producto con IA (título limpio, marca, modelo, color, tags).
// Reutilizado por el script `ai:tag` y por el auto-encadenado del importador.
import { structured, MODELS } from "./ai.js";

export const TAG_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    clean_title: { type: "string" },
    brand: { type: ["string", "null"] },
    model_name: { type: ["string", "null"] },
    colorway: { type: ["string", "null"] },
    gender: { type: "string", enum: ["men", "women", "unisex", "kids", "unknown"] },
    category: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["clean_title", "brand", "model_name", "colorway", "gender", "category", "tags"],
};

const SYSTEM =
  "Eres un catalogador de moda/streetwear experto. Normalizas nombres de producto " +
  "ruidosos (con erratas, sin espacios, en varios idiomas) a metadatos limpios. " +
  "Corrige erratas evidentes (p.ej. 'Stonel sland' -> 'Stone Island'). " +
  "clean_title en espanol, conciso y legible. tags: 3-8 etiquetas utiles para buscar " +
  "(estilo, material, ocasion, tipo). Si algo no se sabe, usa null (o 'unknown' en gender).";

export async function tagOne({ name, category, price }) {
  return structured({
    system: SYSTEM, model: MODELS.fast, schema: TAG_SCHEMA, maxTokens: 400,
    prompt: `Nombre crudo: "${name}"\nCategoria actual: ${category || "?"}\nPrecio: ${price ?? "?"} EUR\n\nDevuelve los metadatos normalizados.`,
  });
}

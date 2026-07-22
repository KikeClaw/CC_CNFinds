// Etiquetado de un producto con IA (título limpio, marca, modelo, color, tags).
// Reutilizado por el script `ai:tag` y por el auto-encadenado del importador.
import { structured, MODELS } from "./ai.js";
import { CATEGORIES } from "./categories.js";

export const TAG_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    clean_title: { type: "string" },
    clean_title_en: { type: "string" },
    brand: { type: ["string", "null"] },
    model_name: { type: ["string", "null"] },
    colorway: { type: ["string", "null"] },
    gender: { type: "string", enum: ["men", "women", "unisex", "kids", "unknown"] },
    // Categoría ACOTADA: la IA elige exactamente una de la lista canónica
    // (evita cientos de categorías casi-duplicadas). "Other" si nada encaja.
    category: { type: "string", enum: CATEGORIES },
    tags: { type: "array", items: { type: "string" } },
  },
  required: ["clean_title", "clean_title_en", "brand", "model_name", "colorway", "gender", "category", "tags"],
};

const SYSTEM =
  "Eres un catalogador de moda/streetwear experto y bilingue (espanol e ingles). " +
  "Normalizas nombres de producto ruidosos (con erratas, sin espacios, en varios idiomas) " +
  "a metadatos limpios. Corrige erratas evidentes (p.ej. 'Stonel sland' -> 'Stone Island'). " +
  "clean_title: titulo conciso y legible EN ESPANOL. clean_title_en: el mismo titulo EN INGLES " +
  "(traduce el tipo de prenda: sudadera->hoodie, zapatillas->sneakers, etc.; deja marca y modelo igual). " +
  "tags: 4-10 etiquetas utiles para buscar (estilo, material, ocasion, tipo), incluyendo terminos " +
  "TANTO en espanol COMO en ingles (p.ej. 'sudadera','hoodie','negro','black') para que la busqueda " +
  "funcione en los dos idiomas. Si algo no se sabe, usa null (o 'unknown' en gender). " +
  "model_name: el modelo CON su variante distintiva si la tiene (p.ej. 'Alaska Fur', 'Alaska Soft', " +
  "'Air Force 1 Low', 'Speedy Mini'). NO elimines ese descriptor: dos variantes distintas deben tener " +
  "model_name distinto, o un comparador las mezclaria como si fueran el mismo producto. " +
  "category: clasifica por el OBJETO FISICO real, NUNCA por el nombre del modelo ni la linea de marca. " +
  "Unas botas, zapatillas o sandalias son 'Shoes' aunque el modelo se llame 'Alaska'; un bolso es 'Bags'; " +
  "una chaqueta 'Coats & Jackets'. Fijate en QUE es el articulo, no en como se llama.";

export async function tagOne({ name, category, price }) {
  return structured({
    system: SYSTEM + " category: elige EXACTAMENTE una de: " + CATEGORIES.join(", ") + ". Usa 'Other' solo si ninguna encaja.",
    model: MODELS.fast, schema: TAG_SCHEMA, maxTokens: 500,
    prompt: `Nombre crudo: "${name}"\nCategoria actual: ${category || "?"}\nPrecio: ${price ?? "?"} EUR\n\nDevuelve los metadatos normalizados (titulo ES + EN, categoria de la lista, tags bilingues).`,
  });
}

// Tier 1 — Traduce una consulta en lenguaje natural a filtros del catalogo.
// "techwear negro por menos de 50 con buena calidad" -> {category, price_max, ...}
import { structured, MODELS } from "./ai.js";

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    keywords: { type: ["string", "null"] },
    category: { type: ["string", "null"] },
    brand: { type: ["string", "null"] },
    price_min: { type: ["number", "null"] },
    price_max: { type: ["number", "null"] },
    hot_only: { type: "boolean" },
    sort: { type: "string", enum: ["trending", "price_asc", "price_desc", "newest", "name"] },
    explanation: { type: "string" },
  },
  required: ["keywords", "category", "brand", "price_min", "price_max", "hot_only", "sort", "explanation"],
};

// Recibe la consulta + las categorias/marcas validas del catalogo y devuelve filtros.
export async function nlToFilters(query, { categories = [], brands = [] } = {}) {
  const system =
    "Traduces busquedas de compra en lenguaje natural a filtros estructurados para " +
    "un catalogo de moda/streetwear. Usa SOLO categorias y marcas de las listas dadas " +
    "(o null si ninguna encaja). Precios en EUR. " +
    "IMPORTANTE sobre 'keywords': los nombres de producto estan en INGLES. NO repitas " +
    "la categoria ni la marca como keyword, y NO pongas terminos genericos en espanol " +
    "(p.ej. 'zapatillas', 'chaqueta'): si la categoria/marca ya capturan la intencion, " +
    "deja keywords en null. Solo pon keywords para terminos distintivos (modelo, color " +
    "en ingles, coleccion). 'explanation' es una frase corta en espanol.";
  const prompt =
    `Consulta: "${query}"\n\n` +
    `Categorias validas: ${categories.join(", ") || "(ninguna)"}\n` +
    `Marcas frecuentes: ${brands.join(", ") || "(ninguna)"}\n\n` +
    "Devuelve los filtros.";
  return structured({ system, prompt, schema: SCHEMA, model: MODELS.fast, maxTokens: 400 });
}

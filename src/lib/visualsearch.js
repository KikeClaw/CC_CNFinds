// Búsqueda visual "W2C this" (MVP sin embeddings): Claude visión mira una foto
// y extrae atributos (marca, categoría, tipo, color, keywords) para encontrar
// equivalentes en el catálogo.
import { structured, MODELS } from "./ai.js";

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    brand: { type: ["string", "null"] },
    category: { type: ["string", "null"] },
    item_type: { type: ["string", "null"] },
    colorway: { type: ["string", "null"] },
    keywords: { type: ["string", "null"] },
    description: { type: "string" },
  },
  required: ["brand", "category", "item_type", "colorway", "keywords", "description"],
};

export async function imageToQuery(image, { categories = [], brands = [] } = {}) {
  const system =
    "Analizas una foto de una prenda/producto de moda o streetwear e identificas qué es, " +
    "para encontrar equivalentes en un catalogo. Usa SOLO categorias y marcas de las listas " +
    "dadas (o null si ninguna encaja). 'keywords' en INGLES (los nombres de producto estan " +
    "en ingles): modelo o color distintivo, sin repetir categoria/marca; null si no aporta. " +
    "'description': una frase en espanol de lo que ves.";
  const prompt =
    `Categorias validas: ${categories.join(", ") || "(ninguna)"}\n` +
    `Marcas frecuentes: ${brands.join(", ") || "(ninguna)"}\n\n` +
    "Identifica la prenda de la imagen y devuelve los atributos para buscar equivalentes.";
  return structured({ system, prompt, schema: SCHEMA, model: MODELS.fast, images: [image], maxTokens: 400 });
}

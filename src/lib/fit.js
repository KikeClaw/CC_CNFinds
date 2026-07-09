// Tier 3 — Arma un outfit/haul dentro de un presupuesto a partir de candidatos.
import { structured, MODELS } from "./ai.js";

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: { id: { type: "integer" }, reason: { type: "string" } },
        required: ["id", "reason"],
      },
    },
    total_estimate: { type: "number" },
    summary: { type: "string" },
  },
  required: ["picks", "total_estimate", "summary"],
};

export async function buildFit(budget, style, candidates) {
  const list = candidates
    .map((p) => `#${p.id} | ${p.name} | ${p.brand ?? "?"} | ${p.category ?? "?"} | ${p.price_eur ?? "?"}EUR`)
    .join("\n");
  const system =
    "Eres un estilista de streetwear. Con una lista de productos (id, nombre, marca, " +
    "categoria, precio en EUR) montas un outfit coherente que NO supere el presupuesto. " +
    "Elige piezas de categorias variadas (calzado, parte de arriba, abajo, accesorio) " +
    "cuando encajen. Usa solo ids de la lista. 'summary' en espanol, 1-2 frases.";
  const prompt =
    `Presupuesto: ${budget} EUR\n${style ? `Estilo pedido: ${style}\n` : ""}\n` +
    `Productos disponibles:\n${list}\n\n` +
    "Devuelve el outfit (picks con motivo), el total estimado y un resumen.";
  return structured({ system, prompt, schema: SCHEMA, model: MODELS.smart, maxTokens: 900 });
}

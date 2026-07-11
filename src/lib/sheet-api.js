// Lector de HIPERVÍNCULOS de Google Sheets vía la Sheets API v4.
// Las hojas tipo cnnewfinds guardan los links de producto como hipervínculos
// (la celda muestra "LINK" y el enlace va detrás). CSV/gviz/htmlview los borran;
// solo la Sheets API los devuelve. Requiere GOOGLE_API_KEY (gratis; para hojas
// públicas basta la key, sin OAuth).
//
// Es layout-agnóstico: recorre todas las celdas, y donde hay un hipervínculo a un
// producto (Taobao/Weidian/1688/agente) crea un candidato, intentando emparejar
// nombre y precio de celdas cercanas (dentro del "bloque" de la fila).
import { parseAnyUrl } from "./parse.js";

const PRICE_RE = /(?:€|US\$|\$)\s?(\d{1,5}(?:[.,]\d{1,2})?)/;
const isNoise = (s) => /^(link|image|imagen|price|precio|name|nombre|qc|na)$/i.test((s || "").trim());

function hrefFromFormula(f) {
  if (!f) return null;
  const m = /HYPERLINK\(\s*"([^"]+)"/i.exec(f);
  return m ? m[1] : null;
}
function cellHref(c) {
  if (!c) return null;
  return c.hyperlink || hrefFromFormula(c.userEnteredValue && c.userEnteredValue.formulaValue) || null;
}
function cleanName(s) {
  return String(s || "").replace(/\s+/g, " ").trim().slice(0, 140);
}

export async function fetchSheetLinks(sheetId, apiKey, { timeoutMs = 40000 } = {}) {
  const fields = "sheets(properties(title),data(rowData(values(hyperlink,formattedValue,userEnteredValue))))";
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?includeGridData=true&fields=${encodeURIComponent(fields)}&key=${apiKey}`;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  let data;
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      let msg = `Sheets API HTTP ${res.status}`;
      try { const j = await res.json(); if (j.error && j.error.message) msg += `: ${j.error.message}`; } catch {}
      throw new Error(msg);
    }
    data = await res.json();
  } finally { clearTimeout(to); }

  const out = [];
  const seen = new Set();
  for (const sheet of data.sheets || []) {
    for (const block of sheet.data || []) {
      for (const row of block.rowData || []) {
        const cells = row.values || [];
        for (let i = 0; i < cells.length; i++) {
          const href = cellHref(cells[i]);
          if (!href) continue;
          const parsed = parseAnyUrl(href);
          if (!parsed) continue;
          const key = `${parsed.platform}:${parsed.itemId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          // precio: celda con símbolo de moneda en la ventana [i-3, i+3]
          let price = null;
          for (let j = Math.max(0, i - 3); j <= Math.min(cells.length - 1, i + 3); j++) {
            const fv = cells[j] && cells[j].formattedValue;
            if (fv) { const m = fv.match(PRICE_RE); if (m) { price = parseFloat(m[1].replace(",", ".")); break; } }
          }
          // nombre: texto no-ruido más cercano a la izquierda (dentro del bloque)
          let name = null;
          for (let j = i; j >= Math.max(0, i - 4); j--) {
            const fv = cells[j] && cells[j].formattedValue;
            if (fv && fv.trim().length > 3 && !isNoise(fv) && !PRICE_RE.test(fv)) { name = cleanName(fv); break; }
          }
          out.push({ platform: parsed.platform, itemId: parsed.itemId, name, price });
        }
      }
    }
  }
  return out;
}

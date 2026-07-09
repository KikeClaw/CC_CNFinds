// Descarga una pestana de Google Sheets como CSV usando el endpoint gviz.
// Funciona sin API key mientras la hoja este compartida como
// "cualquiera con el enlace puede ver".
export function sheetCsvUrl(sheetId, gid) {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

export async function fetchSheet(sheetId, gid) {
  const url = sheetCsvUrl(sheetId, gid);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(
      `No se pudo leer la Sheet (HTTP ${res.status}).\n` +
      `  - Comprueba que este compartida como "cualquiera con el enlace: Lector".\n` +
      `  - URL usada: ${url}`
    );
  }
  return await res.text();
}

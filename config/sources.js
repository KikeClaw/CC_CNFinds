// Lista curada de hojas de la comunidad (cnnewfinds), una por agente. El
// importador automático las ingiere periódicamente (dedup por plataforma+itemId
// y regenerando los links con TUS códigos de afiliado). Edita la lista aquí.
// NOTA: las hojas de cnnewfinds son, entre agentes, los MISMOS productos (mismo
// itemID). Como regeneramos los links con TUS códigos y deduplicamos por itemID,
// con UNA hoja ya tienes el catálogo y todos los links. Por eso aquí va solo tu
// semilla + una hoja de cnnewfinds (Kakobuy). Añade más solo si una fuente tiene
// productos exclusivos.
export const COMMUNITY_SHEETS = [
  // URLs en TEXTO (funciona sin API key):
  { name: "W2Cfinds (semilla)", id: "1tE8qFAUBzayN20TTW5iH_GWP20h8VJGiHDvN-iIZrWk" },
  // Hipervínculos (necesitan GOOGLE_API_KEY):
  { name: "cnnewfinds (Kakobuy)", id: "1ys61I-4I8SyTYxv-YTUQ0TyR--7TTf9y3EGB3r2BYtU" },
];

export const sheetUrl = (id) => `https://docs.google.com/spreadsheets/d/${id}/htmlview`;

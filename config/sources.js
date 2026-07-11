// Lista curada de hojas de la comunidad (cnnewfinds), una por agente. El
// importador automático las ingiere periódicamente (dedup por plataforma+itemId
// y regenerando los links con TUS códigos de afiliado). Edita la lista aquí.
export const COMMUNITY_SHEETS = [
  // URLs en TEXTO (funciona sin API key):
  { name: "W2Cfinds (semilla)", id: "1tE8qFAUBzayN20TTW5iH_GWP20h8VJGiHDvN-iIZrWk" },
  // Hipervínculos (necesitan GOOGLE_API_KEY):
  { name: "Kakobuy", id: "1ys61I-4I8SyTYxv-YTUQ0TyR--7TTf9y3EGB3r2BYtU" },
  { name: "Mulebuy", id: "1LjwXEnzeimRvS2wa5UQz8aRQ72kbHKTy-WbjTFu39TQ" },
  { name: "OOPBuy", id: "1e2cDOttuZtU5N9o695y-LtyXX_b8-tHUirUryX_dXhE" },
  { name: "ACBuy", id: "1TI_9eQ6zw5swLlGlzxU3lrJvU5VYWHPTSXrnnmPFElg" },
  { name: "CSSBuy", id: "1-v4PYXpvKExd_ZEdOeGwH7qEt0U3sbxlv_4TDgpMgqg" },
  { name: "Sugargoo", id: "1nIl_UCHzW6eYA3AsECU6-8xyeIq7pf8zA3OAnoOzVk8" },
  { name: "Hoobuy", id: "1Fwquacwj5DASwes6WmMDVaKG_FWdl0kuqblu8eygIGs" },
  { name: "AllChinaBuy", id: "1B3DnUCfkPqtV4kEdtIe2BSZNRJcY1wHpuH37bJnQEE8" },
  { name: "JoyaGoo", id: "127FZPFQZXHGkx6rBZ3VR5oRrKu5PFJHiwu5xWNCj7MI" },
  { name: "Superbuy", id: "1saVAWI_QD_wW-tzEgSSKfl3sx0Gr58XO4QRvECegeL8" },
  { name: "LoveGoBuy", id: "1sF-W6XFnqkitRpYEITRbrWl45xG9Q-efcbracSFMkNM" },
  { name: "OrientDig", id: "1qEPT0WVlhYKrJeUGyvZrImC3JSl224TitllH3l1lKZM" },
  { name: "Hipobuy", id: "1WQ6Dj_-XkChcMqXxGYT2eQmVCY8YHOmNGzUy-1O1X_E" },
];

export const sheetUrl = (id) => `https://docs.google.com/spreadsheets/d/${id}/htmlview`;

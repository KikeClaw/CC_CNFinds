// Normalización + traducción de categorías.
// Definimos un conjunto CANÓNICO acotado (~20) en inglés (valor almacenado +
// etiqueta EN + slug) con su etiqueta ES. Cualquier categoría cruda (de la IA o
// de las hojas) se mapea a una de estas por diccionario o por palabras clave; lo
// que no encaje va a "Other". Así evitamos que el catálogo explote en cientos de
// categorías casi-duplicadas ("Bags"/"Bag"/"Handbags"/"Bolsos"…).

// canónica -> etiqueta en español (el orden define el orden en los filtros)
export const CAT_ES = {
  "Shoes": "Zapatos",
  "T-Shirts & Shorts": "Camisetas y Shorts",
  "Shirts": "Camisas",
  "Hoodies & Pants": "Sudaderas y Pantalones",
  "Sweaters": "Suéteres",
  "Coats & Jackets": "Abrigos y Chaquetas",
  "Jerseys & Football": "Fútbol",
  "Dresses & Skirts": "Vestidos y Faldas",
  "Bags": "Bolsos",
  "Accessories": "Accesorios",
  "Jewelry": "Joyería",
  "Watches": "Relojes",
  "Eyewear": "Gafas",
  "Belts": "Cinturones",
  "Wallets": "Carteras",
  "Headwear": "Gorros y Gorras",
  "Socks": "Calcetines",
  "Underwear": "Ropa Interior",
  "Electronics": "Electrónica",
  "Home & Living": "Hogar",
  "Other": "Otros",
};

// Lista canónica ordenada (usada por el etiquetado IA para elegir UNA).
export const CATEGORIES = Object.keys(CAT_ES);

// Mapeo por palabras clave (primer match gana). El orden va de específico a
// general: Accessories queda al final para no "tragarse" bolsos/relojes/etc.
const KW = [
  [/\b(sneaker|shoe|footwear|trainer|boot|zapat|sandal|slide|loafer|slipper|mocas|heel)/, "Shoes"],
  [/(handbag|backpack|\bbags?\b|tote|purse|luggage|duffle|crossbody|bolso|mochila|bolsa|satchel|clutch)/, "Bags"],
  [/\b(watch|reloj)/, "Watches"],
  [/\b(sunglass|eyewear|goggle|gafas|lente)/, "Eyewear"],
  [/(jewel|necklace|bracelet|earring|pendant|\bring|joyer|\bjoya|collar|anillo|pulsera)/, "Jewelry"],
  [/\b(belt|cintur)/, "Belts"],
  [/\b(wallet|cartera|billetera|card ?holder)/, "Wallets"],
  [/\b(hat|cap|beanie|gorra|gorro|headwear|bucket)/, "Headwear"],
  [/\b(sock|calcet)/, "Socks"],
  [/\b(underwear|boxer|brief|panty|pantie|lencer|lingerie|\bbra\b|ropa ?interior|calzonc)/, "Underwear"],
  [/\b(dress|skirt|vestido|falda)/, "Dresses & Skirts"],
  [/\b(jersey|football|soccer)/, "Jerseys & Football"],
  [/\b(sweater|knit|jumper|cardigan|sueter|suéter)/, "Sweaters"],
  [/\b(jacket|coat|parka|puffer|windbreaker|outerwear|vest|gilet|abrigo|chaqueta|blazer|\bsuit|trench|overcoat)/, "Coats & Jackets"],
  [/\b(hoodie|sweatshirt|jogger|pant|trouser|sudadera|pantal|sweatpant|jean|denim|legging|tracksuit|chandal|chánd)/, "Hoodies & Pants"],
  [/\b(t-?shirt|tee|camiseta|short|tank ?top|\btops?\b)/, "T-Shirts & Shorts"],
  [/\b(shirt|camisa|polo|blouse)/, "Shirts"],
  [/\b(electronic|phone|charger|earbud|headphone|speaker|electrón|auricular|cargador|airpod|\btech)/, "Electronics"],
  [/\b(home|living|decor|kitchen|hogar|lifestyle|\btoy|figure|blanket|towel|\bmug|poster)/, "Home & Living"],
  [/\b(accessor|accesorio|scarf|scarves|glove|keychain|bufand|guante|llaver|\btie\b|perfume|fragrance|cologne|cosmetic)/, "Accessories"],
];

export function canonCat(raw) {
  if (!raw) return raw;
  const s = String(raw).trim();
  if (CAT_ES[s]) return s;                 // ya es canónica
  const k = s.toLowerCase();
  for (const [re, cat] of KW) if (re.test(k)) return cat;
  return "Other";                          // cajón: evita la explosión de categorías
}

// Etiqueta a mostrar según idioma. EN usa la canónica; ES usa el mapa (fallback a canónica).
export function catLabel(canon, lang = "es") {
  if (!canon) return canon;
  if (lang === "en") return canon;
  return CAT_ES[canon] || canon;
}

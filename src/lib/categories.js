// Normalización + traducción de categorías.
// El catálogo llegó con categorías mezcladas (ES/EN) y duplicadas por mayúsculas
// ("SHOES"/"Shoes"/"shoes", "Accessories"/"Accesorios"…). Aquí definimos un conjunto
// canónico (en inglés, legible, usado como valor almacenado + etiqueta EN + slug) y
// su etiqueta en español. Todo lo demás se mapea a uno de estos.

// raw (minúsculas, sin espacios extra) -> categoría canónica
export const CAT_CANON = {
  "t-shirt and shorts": "T-Shirts & Shorts",
  "t-shirts & shorts": "T-Shirts & Shorts",
  "camisetas y shorts": "T-Shirts & Shorts",
  "accessories": "Accessories",
  "accesorios": "Accessories",
  "accesorios de audio": "Accessories",
  "shoes": "Shoes",
  "zapatos": "Shoes",
  "hoodies and pants": "Hoodies & Pants",
  "hoodies & pants": "Hoodies & Pants",
  "hoodies": "Hoodies & Pants",
  "sudaderas y pantalones": "Hoodies & Pants",
  "pantalones": "Hoodies & Pants",
  "electronic products": "Electronics",
  "electronics": "Electronics",
  "coats and jackets": "Coats & Jackets",
  "coats & jackets": "Coats & Jackets",
  "abrigos y chaquetas": "Coats & Jackets",
  "jersey and football shoes": "Jerseys & Football",
  "jerseys & football": "Jerseys & Football",
  "socks": "Socks",
  "calcetines": "Socks",
  "camisas": "Shirts",
  "shirts": "Shirts",
  "suéteres": "Sweaters",
  "sueteres": "Sweaters",
  "sweaters": "Sweaters",
};

// canónica -> etiqueta en español (la etiqueta EN es la propia clave canónica)
export const CAT_ES = {
  "T-Shirts & Shorts": "Camisetas y Shorts",
  "Accessories": "Accesorios",
  "Shoes": "Zapatos",
  "Hoodies & Pants": "Sudaderas y Pantalones",
  "Electronics": "Electrónica",
  "Coats & Jackets": "Abrigos y Chaquetas",
  "Jerseys & Football": "Fútbol",
  "Socks": "Calcetines",
  "Shirts": "Camisas",
  "Sweaters": "Suéteres",
};

export function canonCat(raw) {
  if (!raw) return raw;
  const k = String(raw).trim().toLowerCase();
  return CAT_CANON[k] || raw;
}

// Etiqueta a mostrar según idioma. EN usa la canónica; ES usa el mapa (fallback a canónica).
export function catLabel(canon, lang = "es") {
  if (!canon) return canon;
  if (lang === "en") return canon;
  return CAT_ES[canon] || canon;
}

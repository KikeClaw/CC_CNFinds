// Extraccion de marca desde el nombre del producto, con diccionario.
// Los nombres vienen tipo "RalphLaurenHoodie", "Gucci Tee", "Air Force1".
// Orden = mas especifico primero (Air Jordan antes que Nike).
const BRANDS = [
  ["Air Jordan", ["air jordan", "jordan"]],
  ["Nike", ["nike", "air force", "air max", "vapormax", "dunk", "tn "]],
  ["Adidas", ["adidas", "yeezy", "gazelle", "samba", "campus", "forum", "spezial"]],
  ["New Balance", ["new balance"]],
  ["Puma", ["puma"]],
  ["Asics", ["asics"]],
  ["Under Armour", ["under armour"]],
  ["Salomon", ["salomon"]],
  ["Arc'teryx", ["arcteryx", "arc'teryx"]],
  ["Louis Vuitton", ["louis vuitton", "lv"]],
  ["Gucci", ["gucci"]],
  ["Dior", ["dior"]],
  ["Chanel", ["chanel"]],
  ["Fendi", ["fendi"]],
  ["Prada", ["prada"]],
  ["Versace", ["versace"]],
  ["Balenciaga", ["balenciaga"]],
  ["Givenchy", ["givenchy"]],
  ["Burberry", ["burberry"]],
  ["Loewe", ["loewe"]],
  ["Alexander McQueen", ["mcqueen"]],
  ["Moncler", ["moncler"]],
  ["Canada Goose", ["canada goose"]],
  ["Moose Knuckles", ["moose knuckles"]],
  ["The North Face", ["north face", "tnf"]],
  ["Stone Island", ["stone island", "stone lsland"]],
  ["Ralph Lauren", ["ralph lauren", "polo ralph"]],
  ["Stussy", ["stussy"]],
  ["Supreme", ["supreme"]],
  ["Bape", ["bape", "bathing ape", "aape"]],
  ["Palm Angels", ["palm angel"]],
  ["Gallery Dept", ["gallery dept"]],
  ["Denim Tears", ["denim tears"]],
  ["Corteiz", ["corteiz", "crtz"]],
  ["Trapstar", ["trapstar"]],
  ["Off-White", ["off white", "off-white"]],
  ["Essentials", ["essentials", "fear of god"]],
  ["Rhude", ["rhude"]],
  ["Amiri", ["amiri"]],
  ["Represent", ["represent"]],
  ["Hellstar", ["hellstar"]],
  ["Sp5der", ["sp5der", "spider"]],
  ["Broken Planet", ["broken planet"]],
  ["Kith", ["kith"]],
  ["Carhartt", ["carhartt"]],
  ["Descente", ["descente"]],
  ["Apple", ["airpods", "air pods", "iphone", "apple", "macbook"]],
  ["Dyson", ["dyson"]],
];

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function extractBrand(name) {
  if (!name) return null;
  const n = norm(name);
  for (const [canon, aliases] of BRANDS) {
    for (const a of aliases) {
      if (n.includes(norm(a))) return canon;
    }
  }
  return null;
}

export const BRAND_LIST = BRANDS.map(([c]) => c);

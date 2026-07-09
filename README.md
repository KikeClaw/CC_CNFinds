# W2C Catalog — Importador (Fase 1)

Importa el catálogo de una spreadsheet W2C (tipo w2cfind) a una base de datos
local y **genera los links de afiliado con TUS códigos** a partir del `itemID`.

> Nunca copia los links de la hoja original (esos pagan al autor de la hoja).
> Solo usa el `ID` del producto y reconstruye el enlace con tu código.

## Requisitos

- Node.js >= 22 (usa `node:sqlite` integrado — **cero dependencias externas**).

## Uso rápido

```bash
npm run import                     # descubre e importa TODAS las pestañas
npm run query -- --category SHOES  # consulta + genera links al vuelo
```

Otras opciones:

```bash
GID=343368508 npm run import       # importar solo una pestaña
SHEET_ID=xxxxx npm run import       # otra spreadsheet
CNFANS_REF=miCodigo npm run import  # con tu código real de afiliado
npm run query -- --brand "Ralph Lauren" --limit 50
```

## Configura tus códigos de afiliado

Edita [`config/agents.js`](config/agents.js) o define variables de entorno:
`CNFANS_REF`, `MULEBUY_REF`, `KAKOBUY_REF`, `OOPBUY_REF`.

⚠️ **Verifica el formato de cada URL** en el panel de afiliado de cada agente:
los formatos incluidos son los habituales del sector pero los agentes los
cambian de vez en cuando. Si uno cambia, solo tocas `config/agents.js`.

## Cómo funciona

```
htmlview ──► descubre pestañas (gid + nombre = categoría)
   │
   └─ por pestaña:
        gviz CSV ──► parseCsv ──► detecta cabecera + BLOQUES en paralelo
                                        │
                        normaliza (itemID, precio, categoría=pestaña)
                                        │
                        dedup por (plataforma, itemID)
                                        │
                        upsert en SQLite (data/catalog.db)
                                        │
        render ──► genera links de afiliado desde (plataforma + itemID)
```

Detalles que resuelve el importador (aprendidos de la hoja real):

- **Fila-banner** antes de la cabecera ("USE Ctrl+F...") → detecta la cabecera real.
- **Bloques de columnas en paralelo** (2-3 grupos `name|price|photo|ID|links`
  en horizontal) → lee todos, no solo el primero.
- **Columna ID sin cabecera** (pestaña HOT SALE) → la infiere por posición
  (después de "photo" / antes del primer link).
- **Duplicados masivos** dentro de cada pestaña → dedup por `(plataforma, itemID)`.
- **Categoría** = nombre de la pestaña (limpio de emojis). "HOT SALE" no es una
  categoría: se guarda como flag `hot`.
- **Nombres multilínea** ("LV\nBag") → normaliza espacios.

## Esquema de datos

Tabla `products` — **sin columnas de links** (se generan al vuelo):

| campo | descripción |
|-------|-------------|
| `platform`, `item_id` | clave única del producto |
| `name`, `brand`, `category` | metadatos |
| `price_eur` | precio |
| `image_url` | imagen cacheada (Fase 2) |
| `hot` | apareció en HOT SALE |
| `status` | active / dead / out_of_stock |
| `first_seen`, `last_seen`, `last_checked` | mantenimiento |

## Estado / limitaciones (Fase 1)

- ✅ ~1.400 productos importados, 99% con precio, categorizados, deduplicados.
- ⚠️ **Imágenes**: la hoja usa `=IMAGE()`, no exportable vía CSV → `image_url`
  vacío. Se rellenará en **Fase 2** (enriquecimiento vía endpoint del agente
  por `itemID`), que también da fotos QC y valida que el producto sigue vivo.
- ⚠️ **Plataforma**: la hoja no la trae; se asume `weidian` (configurable en
  `DEFAULT_PLATFORM`). La Fase 2 la confirmará al enriquecer.
- ⚠️ **Formatos de link de afiliado**: verificar con cada panel (ver arriba).

## Funciones de IA (Claude)

Requieren `ANTHROPIC_API_KEY` en el entorno. Modelos configurables:
`AI_MODEL` (razonamiento, def. `claude-opus-4-8`) y `AI_MODEL_FAST`
(masivo/interactivo, def. `claude-haiku-4-5`). Salidas estructuradas
(`output_config.format`). Si no hay key, los endpoints degradan con un mensaje.

- **Buscador en lenguaje natural** — `GET /api/ai-search?q=...` + botón "IA" del hero.
  Traduce "chaqueta Stone Island cara" → filtros (categoría, marca, precio, orden).
- **Armador de fit/haul** — `GET /api/ai-fit?budget=120&style=techwear` → outfit
  dentro de presupuesto con motivo por pieza.
- **Etiquetado del catálogo** — `npm run ai:tag -- --limit 20` → `clean_title`,
  marca, modelo, colorway, género, tags (mejora búsqueda y SEO).
- **Contenido SEO** — `npm run ai:content -- --limit 10` → descripción + bullets.
- **QC con visión** — `npm run ai:qc -- --limit 10` → `qc_score` (1-10) + notas
  analizando las fotos reales del producto.

## Estructura

```
config/agents.js     códigos de afiliado + generadores de link por agente
src/lib/sheet.js     descarga CSV (gviz)
src/lib/tabs.js      auto-descubrimiento de pestañas (htmlview)
src/lib/csv.js       parser CSV sin dependencias
src/lib/normalize.js cabeceras, bloques, itemID, precio, categoría
src/lib/db.js        esquema SQLite + upsert
src/importer.js      orquestador
src/query.js         consulta + genera links
```

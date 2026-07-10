# CNFinds — imagen sin dependencias externas (usa el SQLite integrado de Node >= 22.5)
FROM node:22-alpine
WORKDIR /app

# Solo package.json (no hay dependencias npm que instalar)
COPY package*.json ./

# Código + (opcional) data/catalog.db si la generaste en local antes de construir
COPY . .

ENV PORT=8080
EXPOSE 8080

# La DB debe existir en data/catalog.db (baked-in o montada como volumen).
# Para generarla dentro del contenedor: docker run ... npm run import && npm run enrich
CMD ["node", "--no-warnings", "src/server.js"]

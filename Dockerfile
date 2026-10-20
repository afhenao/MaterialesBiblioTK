# Imagen de MaterialesBiblioTK: solo dependencias de producción y el código (sin .env: la configuración
# llega por variables de entorno desde Docker Compose o Kubernetes)
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
# Portadas locales: la carpeta debe ser del usuario node (en Docker/Kubernetes se monta un volumen)
RUN mkdir -p uploads/materiales && chown -R node:node uploads

# Sin root dentro del contenedor
USER node

EXPOSE 3003
CMD ["node", "src/app.js"]

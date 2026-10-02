FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY server.js ./
COPY canais.json ./
COPY public ./public
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=384
EXPOSE 8080
CMD ["node", "server.js"]

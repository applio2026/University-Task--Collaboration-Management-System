# ---------- Build Stage ----------
FROM node:20-bookworm-slim AS build

RUN apt-get update && \
    apt-get install -y openssl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY prisma ./prisma

RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ---------- Runtime Stage ----------
FROM node:20-bookworm-slim

RUN apt-get update && \
    apt-get install -y openssl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

RUN npm install

COPY prisma ./prisma

RUN npx prisma generate

COPY --from=build /app/dist ./dist

RUN mkdir -p uploads

EXPOSE 4000

CMD ["node","dist/index.js"]
# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_API_URL=http://localhost:4000/api
ARG VITE_SOCKET_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ---- Runtime: nginx ----
FROM nginx:alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

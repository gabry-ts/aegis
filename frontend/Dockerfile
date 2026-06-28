# AEGIS frontend — Vite build served by nginx, which reverse-proxies the API.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# envsubst expands ${BACKEND_UPSTREAM} in the template at container start.
ENV BACKEND_UPSTREAM=backend:8000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

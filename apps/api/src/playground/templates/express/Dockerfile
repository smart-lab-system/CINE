# Build context = Express app (package.json + app.js/server.js + views/…)
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY . .
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
# Entry mặc định app.js — override bằng PLAYGROUND_EXPRESS_ENTRY nếu cần
CMD ["sh", "-c", "node ${PLAYGROUND_EXPRESS_ENTRY:-app.js}"]

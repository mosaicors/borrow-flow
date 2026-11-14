FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000 3001

# Starts the Next.js server (3000) and the tRPC API (3001) together.
CMD ["npm", "run", "start"]

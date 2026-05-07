FROM node:20-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

# Install all dependencies, including dev (needed for build)
RUN npm ci

COPY . .

# Generate Prisma client at build time (faster startup on Render)
RUN npx prisma generate

# Build the Remix app (requires Vite from devDependencies)
RUN npm run build

# Remove devDependencies to keep the image slim
RUN npm prune --omit=dev

CMD ["npm", "run", "docker-start"]

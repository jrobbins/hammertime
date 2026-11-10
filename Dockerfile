FROM node:22-alpine

WORKDIR /app

# Copy package.json and tsconfig.json (excluding package-lock.json which points to an internal corp proxy)
COPY package.json tsconfig.json ./
RUN npm install

# Copy application sources, static assets, and build TypeScript
COPY . .
RUN npm run build

# Default Cloud Run port is 8080
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]

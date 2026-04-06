FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer caching)
COPY server/package.json server/package-lock.json* server/
RUN cd server && npm install --production

# Copy game files
COPY index_v2.html .
COPY assets/ assets/
COPY server/ server/

EXPOSE 3000

CMD ["node", "server/server.js"]

FROM node:20-alpine

WORKDIR /app

ENV npm_config_fetch_retries=10 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

COPY package*.json ./
RUN npm install && npm install -g nodemon

COPY . .

EXPOSE 3020

CMD ["node", "src/server.js"]


FROM node:20-alpine

WORKDIR /app

ENV npm_config_fetch_retries=10 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

COPY package*.json ./
# nodemon global: volume ẩn /app/node_modules có thể giữ node_modules cũ → npm run dev vẫn tìm được nodemon
RUN npm install && npm install -g nodemon

COPY src ./src

EXPOSE 3017

CMD ["node", "src/server.js"]


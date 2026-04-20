# 1️⃣ Base image
FROM node:20-alpine

# 2️⃣ Set working dir
WORKDIR /app

ENV npm_config_fetch_retries=10 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

# 3️⃣ Copy dependency files
COPY package*.json ./

# 4️⃣ Cài dependencies (bcrypt cần toolchain trên Alpine; nodemon cho dev)
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
  && npm install && npm install -g nodemon \
  && apk del .build-deps

# 5️⃣ Copy toàn bộ code
COPY . .

# 6️⃣ Mở cổng app
EXPOSE 3001

# 7️⃣ Default command (dùng cho production)
CMD ["node", "src/server.js"]

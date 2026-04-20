# 1️⃣ Base image (mediasoup yêu cầu Node >= 22)
FROM node:22-bullseye

# 2️⃣ Set working dir
WORKDIR /app

ENV npm_config_fetch_retries=10 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

# 3️⃣ Build tools cho mediasoup worker fallback compile
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip make g++ && \
    rm -rf /var/lib/apt/lists/*

# 4️⃣ Copy dependency files
COPY package*.json ./

# 5️⃣ Cài dependencies (và nodemon để dev mode dùng được)
RUN npm install && npm install -g nodemon

# 6️⃣ Copy toàn bộ code
COPY . .

# 7️⃣ Mở cổng app
EXPOSE 3005

# 8️⃣ Default command (dùng cho production)
CMD ["node", "src/server.js"]

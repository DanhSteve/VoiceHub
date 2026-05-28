# 1️⃣ Base image (mediasoup yêu cầu Node >= 22)
FROM node:22-bullseye

# 2️⃣ Set working dir
WORKDIR /app

ENV npm_config_fetch_retries=10 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

# 3️⃣ Build tools cho mediasoup worker (postinstall / npm rebuild trong container)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      python3 python3-pip make g++ pkg-config libssl-dev && \
    pip3 install --no-cache-dir invoke && \
    rm -rf /var/lib/apt/lists/*

# 4️⃣ Chỉ đưa manifest vào image — dependencies luôn tải từ npm registry (không bundle node_modules từ máy host).
COPY package*.json ./

# 5️⃣ Cài dependencies + build mediasoup-worker trong image
RUN npm install && npm install -g nodemon
RUN test -x node_modules/mediasoup/worker/out/Release/mediasoup-worker \
  || (echo "mediasoup-worker build failed in image" && exit 1)
RUN mkdir -p /opt/voice-prebuilt && cp -a node_modules /opt/voice-prebuilt/

# 6️⃣ Entrypoint trong image (tránh volume mount /app ghi đè + CRLF Windows)
COPY docker-entrypoint.sh /usr/local/bin/voice-docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/voice-docker-entrypoint.sh && \
    chmod +x /usr/local/bin/voice-docker-entrypoint.sh

# 7️⃣ Copy mã nguồn (node_modules trên host bị loại bởi .dockerignore)
COPY . .

# 8️⃣ Mở cổng app
EXPOSE 3005

ENTRYPOINT ["/usr/local/bin/voice-docker-entrypoint.sh"]
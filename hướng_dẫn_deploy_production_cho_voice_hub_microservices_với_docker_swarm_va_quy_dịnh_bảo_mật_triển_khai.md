# Hướng dẫn Deploy Production cho VoiceHub (Docker Swarm + Microservices)

Dựa trên README dự án VoiceHub với kiến trúc Microservices gồm API Gateway, MongoDB, Redis, RabbitMQ, Socket.IO, mediasoup và các service backend.

---

# 1. Kiến trúc Production đề xuất

## Mô hình triển khai

```text
Internet
   ↓
Reverse Proxy / Load Balancer
   ↓
API Gateway (Docker Swarm Service)
   ↓
Overlay Network
   ↓
Microservices Cluster
```

## Thành phần chính

### Public Layer
- Reverse Proxy (Nginx / Traefik)
- SSL/TLS termination
- Rate limiting
- WAF cơ bản

### Gateway Layer
- API Gateway
- JWT validation
- RBAC permission
- Request routing

### Service Layer
- auth-service
- user-service
- organization-service
- chat-service
- notification-service
- socket-service
- voice-service
- task-service
- ai-task-service

### Infrastructure Layer
- MongoDB Replica Set
- Redis
- RabbitMQ
- Object Storage (nếu có file upload)

---

# 2. Quy định trước khi Deploy

## Không deploy production nếu còn:

- Dùng JWT secret mặc định
- Hardcode password trong source code
- Expose service nội bộ ra Internet
- Chưa bật HTTPS
- Không có backup database
- Không có logging
- Không có monitoring
- Không có resource limit
- Không cấu hình healthcheck

---

# 3. Chuẩn bị Server

## Khuyến nghị cấu hình

### Development
- CPU: 4 Core
- RAM: 8GB
- Disk: 100GB SSD

### Production nhỏ
- CPU: 8 Core
- RAM: 16–32GB
- Disk: NVMe SSD

### Production lớn
- Manager Node: 2–4 vCPU, 8GB RAM
- Worker Node: 8–16 vCPU, 16–64GB RAM

---

# 4. Chuẩn bị Docker Swarm

## Node Architecture

```text
Manager Node
 ├── API Gateway
 ├── Monitoring
 ├── Reverse Proxy

Worker Node 1
 ├── Auth Service
 ├── User Service
 ├── Chat Service

Worker Node 2
 ├── Socket Service
 ├── Notification Service
 ├── Task Service
```

## Tạo swarm

```bash
docker swarm init
```

Worker join:

```bash
docker swarm join --token TOKEN
```

Kiểm tra:

```bash
docker node ls
```

---

# 5. Tạo Overlay Network

```bash
docker network create \
  --driver overlay \
  --attachable \
  voicehub-network
```

Overlay network giúp service giao tiếp cross-node.

---

# 6. Quy định Port Production

## Chỉ được public

| Thành phần | Port |
|------------|------|
| Reverse Proxy | 80 / 443 |
| API Gateway | Internal only hoặc publish riêng |
| Voice Service | UDP/TCP mediasoup |

## Không được expose

- auth-service
- user-service
- task-service
- Redis
- MongoDB
- RabbitMQ
- Socket service

---

# 7. Quy định Docker Image

## Dockerfile production

### Không dùng

```dockerfile
FROM node:latest
```

### Nên dùng

```dockerfile
FROM node:20-alpine
```

## Multi-stage build

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app .
CMD ["npm","start"]
```

---

# 8. Docker Registry

## Push image

```bash
docker build -t voicehub/auth-service:v1 .

docker push voicehub/auth-service:v1
```

## Versioning Rule

Không dùng:

```text
latest
```

Nên dùng:

```text
v1.0.0
v1.0.1
v1.1.0
```

---

# 9. Production Environment Variables

## Root .env

```env
NODE_ENV=production
JWT_SECRET=super_strong_secret
GATEWAY_INTERNAL_TOKEN=strong_internal_token
MONGO_URI=mongodb://...
REDIS_URL=redis://...
RABBITMQ_URL=amqp://...
```

---

# 10. Bảo mật Secret

## Không commit

Không push:

- .env
- JWT secret
- DB password
- RabbitMQ credential
- Redis password

## Dùng Docker Secret

```bash
echo "my_secret" | docker secret create jwt_secret -
```

Trong stack:

```yaml
secrets:
  jwt_secret:
    external: true
```

---

# 11. Docker Stack Deploy

## docker-stack.yml

```yaml
version: '3.9'

services:
  api-gateway:
    image: voicehub/api-gateway:v1
    ports:
      - "3000:3000"
    networks:
      - voicehub-network
    deploy:
      replicas: 2
      restart_policy:
        condition: on-failure

  auth-service:
    image: voicehub/auth-service:v1
    networks:
      - voicehub-network
    deploy:
      replicas: 2

networks:
  voicehub-network:
    external: true
```

Deploy:

```bash
docker stack deploy -c docker-stack.yml voicehub
```

---

# 12. Healthcheck

## Bắt buộc

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

Không có healthcheck dễ khiến Swarm không detect container chết.

---

# 13. Resource Limit

## Tránh crash server

```yaml
deploy:
  resources:
    limits:
      cpus: '1'
      memory: 1G
```

---

# 14. Reverse Proxy Production

## Nginx hoặc Traefik

### Vai trò

- HTTPS
- SSL termination
- Load balancing
- Websocket upgrade
- API gateway proxy

Ví dụ:

```text
client → nginx → api-gateway → service
```

---

# 15. HTTPS / SSL

## Bắt buộc

Không dùng:

```text
http://
```

Nên dùng:

```text
https://
```

## SSL miễn phí

- Let's Encrypt
- Certbot

---

# 16. Bảo mật Network

## Docker Network Rule

- Public network
- Internal network
- DB network

Ví dụ:

```text
public-network
internal-network
database-network
```

---

# 17. Database Production

## MongoDB

Không deploy single container.

Nên dùng:

```text
Mongo Replica Set
```

## Redis

- Redis persistence
- Password auth
- Internal only

## RabbitMQ

- Management panel không public
- Enable user/password

---

# 18. Logging

## Cần logging tập trung

### Stack đề xuất

- ELK Stack
- Loki + Grafana
- Fluentd

---

# 19. Monitoring

## Nên có

- Prometheus
- Grafana
- Alertmanager

Theo dõi:

- CPU
- Memory
- RabbitMQ queue
- Socket connections
- Gateway latency
- Redis hit rate

---

# 20. Rate Limit

## Gateway phải có

Ví dụ:

```text
100 request / minute / IP
```

Giảm:

- Spam API
- Brute force login
- DDoS cơ bản

---

# 21. Security Checklist

## Trước khi deploy

### Infrastructure

- Docker Swarm hoạt động
- Overlay network ổn định
- SSL đã bật
- Firewall bật
- Backup database

### Application

- JWT secret mạnh
- Không hardcode
- RBAC hoạt động
- Gateway internal token đúng
- Service internal token đúng

### Database

- Mongo auth bật
- Redis auth bật
- RabbitMQ auth bật

### Logging

- Có central logging
- Có monitoring
- Có alert

---

# 22. Firewall Production

## Chỉ mở

```text
80
443
22
3000 (nếu cần)
40000–40100 UDP/TCP
```

## Chặn

```text
27017
6379
5672
15672
```

---

# 23. Quy trình Deploy Chuẩn

## Flow

```text
Developer Push Code
        ↓
CI/CD Build Docker Image
        ↓
Push Registry
        ↓
Docker Swarm Pull Image
        ↓
Rolling Update
        ↓
Healthcheck
        ↓
Traffic Switch
        ↓
Monitoring
```

---

# 24. Rolling Update

```yaml
deploy:
  update_config:
    parallelism: 1
    delay: 10s
    order: start-first
```

Giúp update không downtime.

---

# 25. Backup Strategy

## MongoDB

```bash
mongodump
```

## Redis

- Snapshot
- AOF

## RabbitMQ

- Export definitions

---

# 26. Production Recommendation cho VoiceHub

## Nên dùng

- Docker Swarm
- Reverse Proxy
- Mongo Replica Set
- Redis persistence
- RabbitMQ cluster
- Prometheus + Grafana
- Loki logging
- Traefik/Nginx
- Docker Secret

---

# 27. VoiceHub Production Layout

```text
Load Balancer
      ↓
API Gateway (Replica x2)
      ↓
Overlay Network
      ↓
Auth Service
User Service
Chat Service
Notification Service
Socket Service
Voice Service
Task Service
AI Worker
      ↓
Mongo Replica Set
Redis
RabbitMQ
```

---

# 28. Đặc biệt với VoiceHub

## Socket.IO

Phải bật:

- Sticky session
- WebSocket upgrade
- Redis adapter

## Voice Service

Cần:

- UDP range mở
- NAT config
- TURN/STUN server

## Gateway

Không được bypass.

Tất cả request phải đi qua Gateway.

---

# 29. Quy định bắt buộc

## Không được

- Call trực tiếp service từ frontend
- Expose MongoDB public
- Expose Redis public
- Share internal token qua frontend
- Lưu JWT trong localStorage nếu cần security cao

## Nên dùng

- HttpOnly cookie
- Secure cookie
- CSRF protection
- Refresh token rotation

---

# 30. Checklist Go-Live

## Production Ready

- SSL OK
- Healthcheck OK
- Monitoring OK
- Backup OK
- Firewall OK
- Rate limit OK
- Gateway auth OK
- Internal token OK
- Resource limit OK
- Log aggregation OK
- Rolling update OK
- DB replication OK
- Redis persistence OK

---

# Kết luận

VoiceHub là hệ thống microservice tương đối lớn nên production deploy không nên chỉ dùng Docker Compose.

Docker Swarm phù hợp cho:

- Scale service
- High availability
- Rolling update
- Overlay network
- Fault tolerance
- Service discovery

Để hệ thống ổn định production, nên kết hợp:

- Docker Swarm
- Reverse Proxy
- Monitoring
- Security boundary
- Secrets management
- Database replication
- CI/CD pipeline


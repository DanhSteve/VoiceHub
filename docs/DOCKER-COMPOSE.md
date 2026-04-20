# Docker Compose — cấu trúc

| File | Vai trò |
|------|---------|
| `docker-compose.yml` | **Entry mặc định** — `include` infra + core (một lệnh chạy DB + toàn bộ app) |
| `docker-compose.infra.yml` | MongoDB, Redis, volumes, network |
| `docker-compose.core.yml` | API Gateway + microservices (build + mount) |
| `docker-compose.dev.yml` | Nodemon, `CHOKIDAR_*`, `uvicorn --reload` (tùy chọn) |

Yêu cầu **Docker Compose v2.24+** (hỗ trợ `include`).

## Lệnh thường dùng

**Full stack (Mongo + Redis + app, không hot reload):**
```bash
docker compose up -d --build
```

**Full stack + dev (hot reload như trước):**
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

**Chỉ hạ tầng:**
```bash
docker compose -f docker-compose.infra.yml up -d
```

**Chỉ core (Mongo/Redis phải đã chạy sẵn):**
```bash
docker compose -f docker-compose.core.yml up -d --build
```

**Ghép tay thủ công (tương đương `docker compose up`):**
```bash
docker compose -f docker-compose.infra.yml -f docker-compose.core.yml up -d --build
```

## Máy RAM thấp khi build

```bash
export COMPOSE_PARALLEL_LIMIT=1
export DOCKER_BUILDKIT=1
docker compose -f docker-compose.yml -f docker-compose.dev.yml build
```

(Windows: `set COMPOSE_PARALLEL_LIMIT=1`)

## Biến môi trường

- Root `.env`: `USER_SERVICE_INTERNAL_TOKEN`, v.v. (Compose đọc để `${...}`)

## Lưu ý

- File `docker-compose.override.yml` đã bỏ — Compose **không** tự merge dev; phải thêm `-f docker-compose.dev.yml`.

## Sửa lỗi build: `parent snapshot ... does not exist: not found`

Thường gặp trên **Docker Desktop (Windows)** khi build **nhiều image song song** — cache layer BuildKit/containerd lệch.

**Thử theo thứ tự:**

1. **Giới hạn build song song** rồi build lại:
   ```bash
   set COMPOSE_PARALLEL_LIMIT=1
   docker compose -f docker-compose.yml -f docker-compose.dev.yml build --no-cache
   ```
   (Git Bash: `export COMPOSE_PARALLEL_LIMIT=1`)

2. **Dọn cache builder**:
   ```bash
   docker builder prune -af
   docker buildx prune -af
   ```

3. **Khởi động lại Docker Desktop** (WSL2 backend đôi khi cần).

4. Nếu vẫn lỗi, build thử **tắt BuildKit** một lần:
   ```bash
   set DOCKER_BUILDKIT=0
   set COMPOSE_DOCKER_CLI_BUILD=0
   docker compose -f docker-compose.yml -f docker-compose.dev.yml build
   ```

5. Kiểm tra **ổ đĩa còn trống** (image layer cần dung lượng khi export).

## MongoDB: Atlas vs container `mongodb`

- Các service trong repo thường đọc **`MONGODB_URI` từ `services/*/.env`** (thường là **MongoDB Atlas**).
- Service `mongodb` trong [`docker-compose.infra.yml`](docker-compose.infra.yml) **chỉ cần** nếu bạn **chủ động** trỏ URI về `mongodb://...@mongodb:27017/...`. Nếu vẫn dùng Atlas thì container Mongo local có thể chạy nhưng **không** là nguồn dữ liệu mà app đang đọc.

## Volume ẩn `/app/node_modules`

- Nhiều service mount `./services/...:/app` và thêm volume ẩn `/app/node_modules` để giữ `node_modules` từ image.
- Sau khi đổi **Dockerfile** hoặc **package.json**, nếu lệnh thiếu gói (ví dụ `nodemon: not found`), hãy **build lại image** và **tạo lại container**; trường hợp hiếm cần xóa volume ẩn đó rồi `up` lại.

## Healthcheck (tùy chọn)

- Có thể thêm `healthcheck` cho `mongodb` / `redis` và dùng `depends_on: condition: service_healthy` để giảm race khi chuyển sang **Mongo local** (Compose v2).

## Điều hướng SPA & lỗi API (debug nhanh)

- **Client** (`client/.env`): `VITE_API_URL` mặc định trỏ gateway, ví dụ `http://localhost:3000/api`. Nếu API lệch port → request fail, toast, có thể thấy “không chuyển trang” do redirect **401** (token hết hạn) trong interceptor.
- **`ProtectedRoute`**: chỉ cho vào route khi đã đăng nhập; mất token → về `/`.
- **401 / 404**: mở DevTools → Network xem URL và status; gateway log thường in path và service đích (`[API-Gateway] Incoming GET /api/...`).

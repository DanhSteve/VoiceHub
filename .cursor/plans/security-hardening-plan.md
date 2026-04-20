# Kế hoạch chỉnh sửa bảo mật toàn hệ VoiceHub

> Tài liệu tổng hợp các hạng mục đã được rà soát trong codebase (gateway, JWT, socket, chat, nội bộ, webhook, document/voice/task/notification, CORS, v.v.).  
> Dùng làm backlog — thực hiện theo **P0 → P1 → P2**; đánh dấu `[ ]` / `[x]` khi hoàn thành.

---

## Mục tiêu

- Giảm **IDOR**, **spam DM**, **giả mạo nội dung**, **lộ endpoint nội bộ**.
- Đồng bộ **secret / JWT / token nội bộ** giữa các service.
- Sẵn sàng **public**: chỉ gateway (và TLS) hướng ra internet; dịch vụ nội bộ trong VPC / Docker network.
- Bổ sung **quan sát** và **kiểm thử** tối thiểu sau thay đổi.

---

## Đã làm tốt (giữ nguyên nguyên tắc)

| Hạng mục | Ghi chú |
|----------|---------|
| Gateway JWT | Hầu hết `/api/*` qua `authMiddleware` (trừ public routes trong `api-gateway/src/config/services.js`). |
| Socket.IO `/chat` | `socketAuth` — `jwt.verify`, từ chối token hết hạn/sai ký (`shared/middleware/auth.js`). |
| Join room DM | `userId` từ token sau auth, **không** lấy từ client (`socket-service/.../chat.namespace.js`). |
| Chat route nội bộ | `internalServiceOnly` + `CHAT_INTERNAL_TOKEN` (`chat-service/.../message.routes.js`). |
| Publish realtime | Kiểm tra `x-realtime-token` **khi** `REALTIME_INTERNAL_TOKEN` được set (`socket-service/src/server.js`). |
| User presence nội bộ | `USER_SERVICE_INTERNAL_TOKEN` cho `PATCH .../internal/status` (user-service). |

---

## P0 — Ưu tiên cao (trước khi public)

### Chat-service (IDOR & nghiệp vụ DM)

- [ ] **`GET /messages/:messageId` (`getMessageById`)**: Chỉ trả tin nếu `req.user` là **sender**, **receiver**, hoặc thành viên **room** hợp lệ — tránh đọc tin bằng đoán ID.
- [ ] **`markAsRead`**: Chỉ cho phép người **nhận** (hoặc logic đúng theo model) — hiện có nguy cơ cập nhật `isRead` cho tin của người khác nếu biết `messageId`.
- [ ] **`createMessage` (DM có `receiverId`)**: Kiểm tra **quan hệ bạn bè** (gọi friend-service hoặc cache) trước khi lưu — tránh gửi DM tới bất kỳ `receiverId`.
- [ ] **Luồng queue DM** (`friendDmConsumer`): Sau khi thêm check friendship ở REST, đồng bộ policy cho message tạo từ queue (tin cậy sender từ queue nhưng vẫn validate quan hệ nếu cần).

### Socket-service & realtime

- [ ] **`REALTIME_INTERNAL_TOKEN`**: **Fail-closed** — nếu production mà env trống thì **từ chối** mọi `POST /internal/realtime/publish` (hoặc không bind port ra ngoài VPC).
- [ ] **Không expose** port `3017` ra internet — chỉ gateway / mesh nội bộ.

### Cấu hình secret

- [ ] Loại bỏ dùng mặc định `JWT_SECRET=your-secret-key` / `your-webhook-secret-key` trên **production** — một nguồn sự thật, rotate có quy trình.
- [ ] Đảm bảo **cùng `JWT_SECRET`** giữa auth-service, gateway, shared middleware, mọi service verify JWT.

### Gateway

- [ ] Route **chưa map permission** (`getAction` falsy → `next()`): Cân nhắc **deny by default** cho route mới hoặc bổ sung map đầy đủ (`permission.middleware.js`).

---

## P1 — Ngắn hạn

### Socket

- [ ] **Rate limit** theo `socket.user.id` + IP cho `friend:send` và các event nhạy cảm (Redis sliding window hoặc middleware).
- [ ] **Validate payload** (độ dài `content`, kiểu `receiverId`, `messageType` enum) — Joi/Zod.

### File & signed URL

- [ ] Rà soát TTL signed URL; MIME/size đã có — giữ **cap** đồng bộ với GCS (7 ngày read URL).
- [ ] Bucket **CORS** chỉ origin app; không `*` production.

### Webhook-service (Python)

- [ ] **Không** `CORS_ORIGIN=*` production — webhook server-to-server thường không cần CORS mở.
- [ ] Đổi default `WEBHOOK_SECRET`; đồng bộ với service gọi webhook.
- [ ] Quyết định: **đưa webhook sau API Gateway** (route + optional IP allowlist) hay chỉ **mạng nội bộ** — hiện **không** có trong `api-gateway/src/config/services.js`, gọi trực tiếp `:3016`.

### Document-service

- [ ] `app.js` **chưa** gắn `gatewayUserMiddleware` / JWT — controller dùng `req.user`: cần **middleware tương đương** hoặc chỉ tin gateway có gắn `x-user-id` đã verify (rà end-to-end).

### Voice / Task / Notification

- [ ] Voice: đã có `authenticate` trên meeting routes — rà **authorization** (tham gia meeting/org) trong controller.
- [ ] Task: xác nhận file `taskRoutes.js` (legacy) có còn mount hay không — tránh route trùng / không bảo vệ.
- [ ] Notification: `GET /user/:userId` — đảm bảo user chỉ đọc **thông báo của mình** (đã có gateway middleware — kiểm tra controller).

### Logging & PII

- [ ] Giảm log chi tiết path mỗi request trên gateway production.

---

## P2 — Cứng hóa & vận hành

- [ ] WAF / rate limit edge (nếu có CDN).
- [ ] Metrics: số kết nối socket, số message/s, lỗi 401/403.
- [ ] Backup MongoDB; chính sách Redis persistence.
- [ ] Runbook: rotate JWT, rotate `CHAT_INTERNAL_TOKEN` / `REALTIME_INTERNAL_TOKEN` / `WEBHOOK_SECRET`.

---

## Dependency & SCA

- [ ] Chạy **`npm audit`** (và sửa hoặc chấp nhận rủi ro) tại: `api-gateway`, `client`, từng `services/*/package.json`.
- [ ] Tùy chọn: **Dependabot / Snyk** trên repo.

```bash
# Ví dụ (chạy trên máy dev/CI)
cd api-gateway && npm audit
cd ../client && npm audit
```

---

## Tham chiếu file quan trọng

| Khu vực | Đường dẫn |
|---------|-----------|
| Gateway auth / proxy | `api-gateway/src/middlewares/auth.middleware.js`, `proxy.middleware.js` |
| Permission | `api-gateway/src/middlewares/permission.middleware.js`, `config/permissions.js` |
| Socket server + publish nội bộ | `services/socket-service/src/server.js`, `socket/chat.namespace.js` |
| Chat routes & nội bộ | `services/chat-service/src/routes/message.routes.js`, `controllers/message.controller.js`, `workers/friendDmConsumer.js` |
| JWT dùng chung | `shared/middleware/auth.js` |
| User internal | `services/user-service/.../internalServiceAuth.js` |
| Webhook FastAPI | `services/webhook-service/main.py` |
| Document | `services/document-service/src/app.js`, `routes/document.routes.js` |

---

## Ghi chú

- Workspace rule: **không** đổi luồng auth/ủy quyền gateway **trừ khi** nhiệm vụ yêu cầu — các mục trên ưu tiên **sửa lỗ hổng** và **policy** trong service/chat/socket cho đúng.
- Sau mỗi nhóm P0, nên có **test thủ công** hoặc **integration test** ngắn (DM, đọc tin, mark read).

---

*Tạo từ kế hoạch rà soát bảo mật VoiceHub — cập nhật ngày có thể ghi ở commit hoặc dòng dưới.*

**Phiên bản tài liệu:** 1.0

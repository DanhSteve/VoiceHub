# Security runbook — VoiceHub backend

## Ma trận token

| Biến môi trường | Header | Ai gửi | Ai kiểm tra |
|-----------------|--------|--------|--------------|
| `JWT_SECRET` (ký/verify) | `Authorization: Bearer` | Client qua API Gateway | Gateway, auth-service, shared `authenticate` |
| `GATEWAY_INTERNAL_TOKEN` | `x-gateway-internal-token` | API Gateway (proxy) | `gatewayTrust` trên các service dùng `x-user-id` |
| `USER_SERVICE_INTERNAL_TOKEN` | `x-internal-token` | auth-service, friend-service, socket-service, … | user-service `internalServiceAuth` |
| `CHAT_INTERNAL_TOKEN` | `x-internal-token` | task, ai-task-worker, friend, … | chat-service routes `/internal/*` |
| `NOTIFICATION_INTERNAL_TOKEN` | `x-internal-notification-token` hoặc `x-internal-token` | organization-service, webhook, … | notification-service `internalNotificationAuth` |
| `REALTIME_INTERNAL_TOKEN` | `x-realtime-token` (theo socket HTTP) | Emitter nội bộ | socket-service |

## Rotate secret (không downtime tối đa)

1. Thêm giá trị mới vào secret store / `.env` mới.
2. Triển khai song song: cập nhật **consumer** trước (gửi header mới), sau đó **provider** (chấp nhận cả token cũ + mới) nếu cần cửa sổ chuyển tiếp.
3. Với `GATEWAY_INTERNAL_TOKEN`: cập nhật **api-gateway** và **mọi service** có `gatewayTrust` cùng lúc (cùng compose restart).
4. Xóa token cũ sau khi mọi replica đã dùng token mới.

## Kiểm tra nhanh sau deploy

- `GET /api/health/gateway-trust` (qua gateway): `gatewayTrustConfigured: true`.
- Gọi trực tiếp một service (nếu vẫn mở port debug) với `x-user-id` giả **không** có `x-gateway-internal-token` hợp lệ → phải **401/503**, không được gắn user.
- `POST /api/users/internal/bootstrap` không có `x-internal-token` → **401**.
- Organization gửi notification: phải có `NOTIFICATION_INTERNAL_TOKEN` khớp notification-service.

## Liên quan code

- Fail-closed gateway trust: `shared/middleware/gatewayTrust.js`
- Bootstrap profile: `POST /api/users/internal/bootstrap` + `auth-service` verify-email flow
- Compose network: chỉ publish `api-gateway` (+ voice WebRTC nếu cần); xem `docker-compose.core.yml`

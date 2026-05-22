---
name: wave-3c-realtime-snapshots
overview: Sóng 3 — Socket push snapshot (unread, presence, org shell version) giảm polling và refetch.
todos:
  - id: unread-push
    content: Socket event notification:unread_updated (personal + org)
    status: completed
  - id: presence-batch
    content: Client subscribe presence; dùng Redis vh:presence (đã có)
    status: completed
  - id: org-shell-version
    content: org:shell:version bump → client invalidate useOrgShell
    status: completed
  - id: remove-polling
    content: Bỏ refetchInterval badge sidebar nếu socket đủ
    status: completed
isProject: false
---

# Wave 3C — Realtime snapshots

**Sóng:** 3  
**Phụ thuộc:** [wave-1a-react-query-client.plan.md](./wave-1a-react-query-client.plan.md), [wave-2a-org-shell.plan.md](./wave-2a-org-shell.plan.md)  
**Giải quyết:** #9

## Tiền đề — Dev `https://voicehub.local`

> Checklist chung: [_lan-dev-preamble-snippet.md](./_lan-dev-preamble-snippet.md) · [docs/lan-https-voicehub.local.md](../../docs/lan-https-voicehub.local.md)

### Riêng wave 3C (realtime snapshots)

- `VITE_SOCKET_USE_GATEWAY=true`; HTTPS → `window.location.origin` (`wss://voicehub.local/socket.io`).
- Voice signal: `VITE_VOICE_SIGNAL_PATH` qua gateway/Nginx — không `wss://IP:3005` trên máy LAN.
- Snapshot hydrate query: không refetch bằng URL `http://localhost:3000/...`.
- Verify: hai tab cùng `https://voicehub.local` — invalidate badge/sidebar từ máy LAN.

## Mục tiêu

Sau load ban đầu (bootstrap/shell), **cập nhật state qua Socket.IO** thay GET lặp.

## Hiện trạng

- `shared/utils/realtime.js` → `socket-service/internal/realtime/publish`
- Presence: `vh:presence:{userId}` — socket + user batch API
- Notification: có worker Rabbit; client vẫn poll badge 60s (trước 1a)

## Event đề xuất

| Event | Payload | Invalidate |
|-------|---------|------------|
| `notification:unread` | `{ scope, organizationId?, count }` | query badge |
| `org:shell:updated` | `{ organizationId, version }` | `['org', id, 'shell']` |
| `presence:batch` | `{ userId, status }` | presence queries |

Publish từ notification-service sau mark read/create; org-service sau structure change.

## File

- `socket-service` namespace handlers
- `notification-service` emit sau write
- `client/src/context/SocketContext.jsx` listeners
- `NavigationSidebar.jsx` — bỏ interval nếu socket reliable

## Tiêu chí hoàn thành

- [ ] Mark read notification → badge giảm không GET
- [ ] Admin đổi channel structure → client refetch shell trong 3s

## PR gợi ý

PR1 BE emit. PR2 FE listeners + invalidate.

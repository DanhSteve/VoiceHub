# Runbook — Realtime snapshots (wave 3C)

## Events

| Event | Publisher | Client |
|-------|-----------|--------|
| `notification:unread_updated` | notification-service sau create/read/delete | `QueryRealtimeSync` → `setQueryData` badge |
| `org:shell:updated` | organization-service sau `invalidateOrgReadCache` | invalidate `['org', orgId, 'shell']` |
| `presence:batch` | socket-service connect/disconnect + `presence:subscribe` | `SocketContext` → `onlineUsers` |

## Env

- `REALTIME_INTERNAL_TOKEN` — khớp giữa services và socket-service
- `SOCKET_SERVICE_URL` — URL nội bộ Docker
- Client: `VITE_SOCKET_USE_GATEWAY=true` trên LAN HTTPS

## Kiểm thử

1. Hai tab `https://voicehub.local` — mark read notification → badge giảm không GET `/notifications?limit=1`
2. Admin đổi cấu trúc kênh → tab member thấy shell/sidebar cập nhật trong vài giây
3. Member sidebar — presence online/offline khi user khác connect/disconnect

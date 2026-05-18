# Realtime HA Checklist (a6)

## socket-service
- `SOCKET_IO_REDIS_ADAPTER=true`
- `SOCKET_SERVICE_REPLICAS>=2`
- Redis reachable from all replicas.

## Load balancer / Nginx
- Sticky session for websocket endpoint `/socket.io`.
- Preserve `Upgrade` and `Connection` headers.
- Keep `X-Forwarded-*` headers.

## Validation
1. Open 2 browser clients.
2. Restart one socket-service task.
3. Verify reconnect, presence state, and message delivery.

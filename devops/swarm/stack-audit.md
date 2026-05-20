# Stack Audit Result (a1)

## Covered
- Image-based runtime for all services (no source bind mount).
- Overlay network: `enterprise-network`.
- Swarm `deploy` section on all services.
- Resource limits/reservations specified.
- Placement constraints:
  - `voice-service` on `node.labels.voice==true`
  - AI runtime on `node.labels.ai==true`
- Rollback-safe update strategy applied to critical workers/realtime/gateway.

## Open decisions
- `voice-service` remains single replica (by design with in-memory room state).
- Stateful infra still single instance in Plan A.

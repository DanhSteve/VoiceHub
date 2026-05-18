# Autoscale Policy (b5)

## CPU-bound workers
Applies to:
- `ai-task-extract-worker`
- `ai-task-sync-worker`

Scale out when:
- CPU > 70% for 5 minutes OR queue depth > 100.

Scale in when:
- CPU < 35% and queue depth < 20 for 15 minutes.

## IO-bound workers
Applies to:
- `notification-dispatch-worker`
- `webhook-delivery-worker`

Scale out when:
- queue depth > 200 OR retry rate > 5%.

Scale in when:
- queue depth < 30 for 20 minutes.

## DB-bound worker/API mix
Applies to:
- `task-worker`
- `chat-service` (if background jobs added)

Scale cautiously:
- max +1 replica every 10 minutes,
- monitor DB connection and lock contention before next increment.

## Guardrails
- Keep min replicas:
  - task-worker: 1
  - ai extract/sync: 1 each
  - notification/webhook worker: 1
- Define hard max per node capacity.

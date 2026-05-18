# Plan A Cutover Runbook

## 1) Pre-check
1. `docker info` confirms Swarm active.
2. All required images exist in registry.
3. Node labels exist: `voice=true`, `ai=true`.
4. `.env` has image tags and required tokens.

## 2) Deploy order
1. Deploy infra (or full stack with infra healthy first).
2. Deploy API services.
3. Deploy workers (`task-worker`, `ai-task-*`, `notification-dispatch-worker`, `webhook-delivery-worker`).
4. Deploy realtime/voice.

## 3) Canary checks
1. Login + gateway health.
2. Chat message realtime.
3. Upload file -> task queue path (`task-file-worker`).
4. AI extract/sync jobs.
5. Voice 2 users.

## 4) Rollback rules
- Any critical API 5xx spike > 5 minutes: rollback latest service.
- Queue backlog growth without drain > 10 minutes: scale worker or rollback worker image.
- Realtime disconnect spike: rollback `socket-service` and verify sticky session.

Rollback command:
`docker service update --rollback <stack>_<service>`

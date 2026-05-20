# Load + Chaos Validation (b6)

## Load scenarios
1. Burst chat messages in organization channels.
2. Upload batch files to trigger `task-file-worker`.
3. Push AI extraction and sync jobs continuously.
4. Trigger webhook bursts for friend/task events.
5. Keep 2-10 concurrent voice rooms.

## Chaos scenarios
1. Kill one worker replica (`docker service update --force`).
2. Restart Redis.
3. Restart RabbitMQ.
4. Drain node labeled `ai=true`.

## Pass criteria
- No message loss (DLQ only for exhausted retries).
- Queue backlog drains after failure recovery.
- Realtime reconnects successfully.
- Voice rooms new join still succeeds.
- Rollback command works for each changed service.

# HA Infra Roadmap (b7)

## Phase 1 (current)
- Single Mongo/Redis/Rabbit in Swarm stack for fast cutover.

## Phase 2
- MongoDB Replica Set (3 nodes).
- Redis Sentinel or Redis Cluster.
- RabbitMQ quorum queues and multi-node cluster.

## Phase 3
- Move stateful infra to dedicated platform (managed DB/broker) if available.
- Keep Swarm for stateless workloads and workers.

## Migration principle
- Migrate one infra component at a time.
- Keep compatibility via service DNS names.
- Validate with canary and rollback checkpoints.

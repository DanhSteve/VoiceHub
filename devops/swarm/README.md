# VoiceHub Swarm Operations

## Files
- `stack-audit.md`: checklist audit for swarm readiness.
- `env-secrets-inventory.md`: env/secrets inventory.
- `build-and-push.sh`: local build/push helper.
- `deploy-stack.sh`: deploy stack command wrapper.
- `node-labels.sh`: apply node labels for placement.
- `realtime-ha-checklist.md`: sticky + Redis adapter verification.
- `cutover-runbook.md`: Plan A rollout/rollback.
- `observability-baseline.md`: monitoring baseline.
- `domain-worker-candidates.md`: Plan B candidate workers.
- `autoscale-policy.md`: scaling thresholds.
- `load-chaos-validation.md`: validation scenarios.
- `ha-infra-roadmap.md`: infra HA roadmap.
- `scale-runbook.sh`: scale command templates.

## Quick start
1. Build/push images.
2. Label nodes.
3. Deploy stack.
4. Run canary.
5. Scale workers by queue backlog.

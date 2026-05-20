#!/usr/bin/env bash
set -euo pipefail

STACK="${STACK:-voicehub}"

echo "Scale worker examples:"
echo "docker service scale ${STACK}_task-worker=2"
echo "docker service scale ${STACK}_ai-task-extract-worker=3"
echo "docker service scale ${STACK}_ai-task-sync-worker=2"
echo "docker service scale ${STACK}_notification-dispatch-worker=2"
echo "docker service scale ${STACK}_webhook-delivery-worker=2"
echo "docker service scale ${STACK}_socket-service=2"

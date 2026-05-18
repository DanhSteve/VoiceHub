#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${STACK_NAME:-voicehub}"
STACK_FILE="${STACK_FILE:-docker-stack.yml}"

echo "Deploying stack ${STACK_NAME} with ${STACK_FILE}"
docker stack deploy -c "${STACK_FILE}" "${STACK_NAME}" --with-registry-auth

echo "Waiting for rollout..."
sleep 5
docker stack services "${STACK_NAME}"

echo "Tasks:"
docker stack ps "${STACK_NAME}" --no-trunc

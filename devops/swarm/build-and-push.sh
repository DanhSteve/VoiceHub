#!/usr/bin/env bash
set -euo pipefail

# Local build/push helper for non-CI flow.
# Requires docker login to your registry first.

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

# Ưu tiên nạp biến từ .env gốc của repo, sau đó mới fallback default.
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

REGISTRY="${REGISTRY}"
OWNER="${OWNER}"
TAG="${TAG}"

declare -a IMAGES=(
  "api-gateway:./api-gateway"
  "auth-service:./services/auth-service"
  "user-service:./services/user-service"
  "organization-service:./services/organization-service"
  "friend-service:./services/friend-service"
  "role-permission-service:./services/role-permission-service"
  "chat-service:./services/chat-service"
  "task-service:./services/task-service"
  "ai-task-service:./services/ai-task-service"
  "ai-task-worker:./services/ai-task-worker"
  "document-service:./services/document-service"
  "voice-service:./services/voice-service"
  "notification-service:./services/notification-service"
  "webhook-service:./services/webhook-service"
  "socket-service:./services/socket-service"
)

for item in "${IMAGES[@]}"; do
  name="${item%%:*}"
  ctx="${item##*:}"
  full="${REGISTRY}/${OWNER}/voicehub/${name}:${TAG}"
  latest="${REGISTRY}/${OWNER}/voicehub/${name}:latest"
  echo "Building ${name} from ${ctx}"
  docker build -t "${full}" -t "${latest}" "${ctx}"
  docker push "${full}"
  docker push "${latest}"
done

echo "Done. Export tags into .env before stack deploy."

#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./devops/swarm/node-labels.sh <voice-node-name> <ai-node-name>
# Example:
#   ./devops/swarm/node-labels.sh manager-1 worker-ai-1

VOICE_NODE="${1:-}"
AI_NODE="${2:-}"

if [[ -z "$VOICE_NODE" || -z "$AI_NODE" ]]; then
  echo "Usage: $0 <voice-node-name> <ai-node-name>"
  exit 1
fi

docker node update --label-add voice=true "$VOICE_NODE"
docker node update --label-add ai=true "$AI_NODE"

echo "Applied labels:"
docker node inspect "$VOICE_NODE" --format '{{ .Spec.Labels }}'
docker node inspect "$AI_NODE" --format '{{ .Spec.Labels }}'

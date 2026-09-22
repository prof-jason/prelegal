#!/usr/bin/env bash
# Build and run the Prelegal container. The database inside the container
# is created from scratch on every start, so re-running this script always
# gives a fresh, empty database.
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE_TAG="prelegal:latest"
CONTAINER_NAME="prelegal-app"

docker build -t "$IMAGE_TAG" .

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

ENV_FILE_ARGS=()
if [ -f .env ]; then
  ENV_FILE_ARGS=(--env-file .env)
fi

docker run -d --name "$CONTAINER_NAME" -p 8000:8000 "${ENV_FILE_ARGS[@]}" "$IMAGE_TAG"

echo "Prelegal is starting at http://localhost:8000"
echo "Run scripts/stop-linux.sh to stop it."

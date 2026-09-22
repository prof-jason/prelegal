#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="prelegal-app"

# `docker rm -f` exits 0 even for a container that doesn't exist, so check
# first to report an accurate message.
if [ -n "$(docker ps -aq -f name="^${CONTAINER_NAME}\$")" ]; then
  docker rm -f "$CONTAINER_NAME" >/dev/null
  echo "Prelegal stopped."
else
  echo "Prelegal was not running."
fi

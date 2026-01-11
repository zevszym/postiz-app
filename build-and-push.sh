#!/bin/bash
set -e

# Configuration
REGISTRY="${DOCKER_REGISTRY:-msymaniuksztis}"
IMAGE_NAME="${DOCKER_IMAGE:-postiz-app}"
VERSION="${VERSION:-$(git rev-parse --short HEAD)}"

echo "Building ${REGISTRY}/${IMAGE_NAME}:${VERSION}"

# Build the image
docker buildx build --platform linux/amd64 \
  -f Dockerfile.dev \
  -t ${REGISTRY}/${IMAGE_NAME}:${VERSION} \
  -t ${REGISTRY}/${IMAGE_NAME}:latest \
  --build-arg NEXT_PUBLIC_VERSION=${VERSION} \
  --pull \
  --no-cache \
  --provenance=false --sbom=false \
  --push .

echo "Successfully built and pushed:"
echo "  - ${REGISTRY}/${IMAGE_NAME}:${VERSION}"
echo "  - ${REGISTRY}/${IMAGE_NAME}:latest"

#!/bin/bash
set -e

# Configuration
REGISTRY="${DOCKER_REGISTRY:-msymaniuksztis}"
IMAGE_NAME="${DOCKER_IMAGE:-postiz-app}"
VERSION="${VERSION:-$(git rev-parse --short HEAD)}"

echo "Building ${REGISTRY}/${IMAGE_NAME}:${VERSION}"

# Build the image
docker build \
  -f Dockerfile.dev \
  -t ${REGISTRY}/${IMAGE_NAME}:${VERSION} \
  -t ${REGISTRY}/${IMAGE_NAME}:latest \
  --build-arg NEXT_PUBLIC_VERSION=${VERSION} \
  --no-cache \
  .

echo "Build complete. Pushing..."

docker push ${REGISTRY}/${IMAGE_NAME}:${VERSION}
docker push ${REGISTRY}/${IMAGE_NAME}:latest

echo "Successfully built and pushed:"
echo "  - ${REGISTRY}/${IMAGE_NAME}:${VERSION}"
echo "  - ${REGISTRY}/${IMAGE_NAME}:latest"

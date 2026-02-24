#!/usr/bin/env bash
set -euo pipefail

# Smart Stable Manager - Deploy Script
# Usage: ./deploy.sh
# Requires: docker and docker compose installed, .env file configured

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Smart Stable Manager Deploy ==="

# Check prerequisites
if ! command -v docker &> /dev/null; then
  echo "Error: docker is not installed"
  exit 1
fi

if [ ! -f .env ]; then
  echo "Error: .env file not found. Copy .env.example to .env and configure it."
  exit 1
fi

echo "1/4  Pulling latest code..."
git pull origin "$(git rev-parse --abbrev-ref HEAD)" 2>/dev/null || true

echo "2/4  Building containers..."
docker compose build --no-cache

echo "3/4  Starting services..."
docker compose down --remove-orphans
docker compose up -d

echo "4/4  Running database migrations and seed..."
docker compose exec -T backend sh -c "npx prisma migrate deploy && npx tsx prisma/seed.ts"

echo ""
echo "=== Deploy complete ==="
echo "App should be available at: $(grep APP_URL .env | cut -d= -f2)"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f        # View logs"
echo "  docker compose ps             # Service status"
echo "  docker compose restart        # Restart services"
echo "  docker compose down           # Stop all"

#!/bin/bash
# deploy.sh — Run this on your VPS to deploy the warehouse platform
# Usage: bash deploy.sh

set -e  # Exit on any error

echo "🚀 Starting Warehouse Platform Deployment..."

# ── 1. Check .env exists ──────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
    echo "❌ .env file not found. Copy .env.production to .env and fill in values."
    exit 1
fi

echo "✅ .env found"

# ── 2. Pull latest code ───────────────────────────────────────────────────────
echo "📦 Pulling latest code..."
git pull origin main

# ── 3. Build and start containers ─────────────────────────────────────────────
echo "🐳 Building Docker containers..."
docker compose -f docker-compose.prod.yml --env-file .env down
docker compose -f docker-compose.prod.yml --env-file .env build --no-cache
docker compose -f docker-compose.prod.yml --env-file .env up -d

echo "⏳ Waiting for services to start..."
sleep 10

# ── 4. Check health ───────────────────────────────────────────────────────────
echo "🔍 Checking services..."
docker ps | grep warehouse

echo ""
echo "✅ Deployment complete!"
echo "   Backend:  http://localhost:3001/api"
echo "   Frontend: http://localhost:3000"
echo ""
echo "📋 View logs with:"
echo "   docker logs warehouse_backend -f"
echo "   docker logs warehouse_frontend -f"
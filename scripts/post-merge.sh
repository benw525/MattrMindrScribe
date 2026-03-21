#!/bin/bash
set -e

echo "=== Post-merge setup ==="

echo "Installing dependencies..."
npm install --include=dev < /dev/null

echo "=== Post-merge setup complete ==="

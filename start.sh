#!/bin/bash
npx tsx server/index.ts &
SERVER_PID=$!

echo "Waiting for backend to start..."
for i in $(seq 1 30); do
  if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "Backend is ready"
    break
  fi
  sleep 1
done

npx vite &
VITE_PID=$!

trap "kill $SERVER_PID $VITE_PID 2>/dev/null" EXIT

wait

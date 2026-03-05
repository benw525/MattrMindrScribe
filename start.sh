#!/bin/bash
npx tsx server/index.ts &
SERVER_PID=$!

npx vite &
VITE_PID=$!

trap "kill $SERVER_PID $VITE_PID 2>/dev/null" EXIT

wait -n
kill $SERVER_PID $VITE_PID 2>/dev/null

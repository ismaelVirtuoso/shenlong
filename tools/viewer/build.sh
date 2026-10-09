#!/usr/bin/env bash
# Recompila o viewer (mesmo código da cena do app).
cd "$(dirname "$0")/../.." && mobile/node_modules/.bin/esbuild tools/viewer/main.ts --bundle --format=iife \
  --outfile=tools/viewer/dist/viewer.js --alias:three=./mobile/node_modules/three --define:__DEV__=false --define:process.env.EXPO_PUBLIC_PROFILE='"0"' --log-level=warning

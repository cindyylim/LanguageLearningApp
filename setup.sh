#!/bin/bash
set -e

# Install root dependencies (if any)
if [ -f package.json ]; then
  npm install
fi

# Install client dependencies
if [ -d client ]; then
  cd client && npm install && cd ..
fi

# Install server dependencies
if [ -d server ]; then
  cd server && npm install && cd ..
fi

# Build both
if [ -d client ]; then
  cd client && npm run build && cd ..
fi
if [ -d server ]; then
  cd server && npm run build && cd ..
fi

echo "Setup complete!" 
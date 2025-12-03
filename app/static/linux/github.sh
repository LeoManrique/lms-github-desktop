#!/bin/bash

# Resolve the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Navigate to the app resources directory
RESOURCES_DIR="$(dirname "$SCRIPT_DIR")"
APP_DIR="$(dirname "$RESOURCES_DIR")"

# Find the electron binary
ELECTRON="$APP_DIR/desktop"
CLI="$RESOURCES_DIR/resources/app/cli.js"

# Run the CLI with Node
ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"

exit $?

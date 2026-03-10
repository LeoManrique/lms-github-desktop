#!/bin/bash
# Install script for LMS GitHub Desktop (tar.gz / manual installs)
# Usage: ./install.sh [install-dir]
#   install-dir defaults to /opt/lms-github-desktop

set -e

INSTALL_DIR="${1:-/opt/lms-github-desktop}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The script lives inside the extracted dist directory alongside the 'desktop' binary
if [ ! -f "$SCRIPT_DIR/desktop" ]; then
  echo "Error: 'desktop' binary not found in $SCRIPT_DIR"
  echo "Run this script from inside the extracted archive directory."
  exit 1
fi

# Copy app files to install directory if not already there
if [ "$SCRIPT_DIR" != "$INSTALL_DIR" ]; then
  echo "Copying app to $INSTALL_DIR..."
  sudo mkdir -p "$INSTALL_DIR"
  sudo cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR/"
else
  echo "App already at $INSTALL_DIR"
fi

# Install .desktop file with correct paths
DESKTOP_FILE="${XDG_DATA_HOME:-$HOME/.local/share}/applications/lms-github-desktop.desktop"
mkdir -p "$(dirname "$DESKTOP_FILE")"

cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Name=LMS GitHub Desktop
Comment=LMS GitHub Desktop is a seamless way to contribute to projects on GitHub.
GenericName=Git Client
Exec=$INSTALL_DIR/desktop %U
Icon=$INSTALL_DIR/resources/app/static/icon-logo.png
Type=Application
StartupNotify=true
Categories=Development;RevisionControl;
MimeType=x-scheme-handler/x-github-client;x-scheme-handler/github-mac;x-scheme-handler/x-github-desktop-auth;x-scheme-handler/x-github-desktop-dev-auth;
Keywords=github;git;vcs;
EOF

echo "Installed desktop entry: $DESKTOP_FILE"

# Update desktop database
if command -v update-desktop-database &> /dev/null; then
  update-desktop-database "$(dirname "$DESKTOP_FILE")" 2>/dev/null || true
fi

# Update icon cache
if command -v gtk-update-icon-cache &> /dev/null; then
  gtk-update-icon-cache -f -t /usr/share/icons/hicolor 2>/dev/null || true
fi

# Create symlink in PATH
if [ -d /usr/local/bin ]; then
  sudo ln -sf "$INSTALL_DIR/desktop" /usr/local/bin/lms-github-desktop 2>/dev/null || true
fi

echo "Installation complete!"
echo "  App:     $INSTALL_DIR/desktop"
echo "  Desktop: $DESKTOP_FILE"

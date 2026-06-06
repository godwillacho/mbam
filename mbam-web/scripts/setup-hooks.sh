#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-hooks.sh
#
# PURPOSE:
#   One-time setup script. Run this once after cloning both repos.
#   Installs the post-commit hook in both mbam-web and mbam-api so that
#   every commit automatically pushes to GitHub.
#
# USAGE:
#   chmod +x setup-hooks.sh
#   ./setup-hooks.sh
#
# REQUIRES: Both mbam-web and mbam-api directories in the same parent folder.
# ─────────────────────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"

install_hook() {
  local REPO_DIR="$1"
  local REPO_NAME="$(basename $REPO_DIR)"

  if [ ! -d "$REPO_DIR/.git" ]; then
    echo "⚠  $REPO_NAME is not a git repository — skipping"
    return
  fi

  local HOOK_SRC="$REPO_DIR/scripts/post-commit"
  local HOOK_DST="$REPO_DIR/.git/hooks/post-commit"

  cp "$HOOK_SRC" "$HOOK_DST"
  chmod +x "$HOOK_DST"
  echo "✓  Hook installed in $REPO_NAME"
}

echo "Installing Mbam git hooks..."
echo ""

install_hook "$PARENT_DIR/mbam-web"
install_hook "$PARENT_DIR/mbam-api"

echo ""
echo "Done. Every commit in both repos will now auto-push to GitHub."
echo "Make sure you have run 'gh auth login' or have SSH keys configured."

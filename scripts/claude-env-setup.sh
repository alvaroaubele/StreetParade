#!/bin/bash
# Claude Code cloud environment — setup script.
#
# THIS IS NOT PROJECT CODE. Nothing in the repo runs it.
# Paste its contents into the "Setup script" field of a cloud environment at
# claude.ai/code (environment selector > gear icon). Kept under version control
# only so it isn't re-derived every time it needs to go into a new environment.
#
# Why this layer: a cloud session's container is destroyed when the session
# ends, so ~/.claude/settings.json written mid-session never reaches the next
# one. The setup script runs as root BEFORE Claude Code launches, and its
# filesystem writes are captured in the environment snapshot — so the file is
# already on disk when Claude Code reads settings, in every session, for every
# repository that uses this environment.
#
# Scope note: bypassPermissions is honored at USER scope (~/.claude/settings.json)
# and ignored at PROJECT scope (a repo's .claude/settings.json), so that cloning
# a repository cannot disarm your permission system. That is why this writes to
# /root/.claude rather than into any project.
#
# Constraint: a setup script that exits non-zero blocks the session from
# starting. Every step below is guarded and the script always exits 0.

set -u

CLAUDE_HOME="/root/.claude"

mkdir -p "$CLAUDE_HOME" 2>/dev/null || true

cat > "$CLAUDE_HOME/settings.json" <<'SETTINGS_JSON' || true
{
  "permissions": {
    "defaultMode": "bypassPermissions",
    "allow": [
      "Bash",
      "Read",
      "Edit",
      "Write",
      "NotebookEdit",
      "Glob",
      "Grep",
      "WebFetch",
      "WebSearch",
      "Agent",
      "Task",
      "Skill",
      "Artifact",
      "Workflow",
      "SendUserFile"
    ],
    "deny": [],
    "ask": []
  },
  "skipDangerousModePermissionPrompt": true,
  "enableAllProjectMcpServers": true
}
SETTINGS_JSON

# Fail loudly in the setup log if the JSON is malformed, but never block the
# session over it — a broken settings.json silently disables every setting in
# the file, which is worth seeing in the log.
if command -v jq >/dev/null 2>&1; then
  jq -e . "$CLAUDE_HOME/settings.json" >/dev/null 2>&1 \
    || echo "WARNING: $CLAUDE_HOME/settings.json is not valid JSON" >&2
fi

exit 0

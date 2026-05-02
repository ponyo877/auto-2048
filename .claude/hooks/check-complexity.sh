#!/usr/bin/env bash
# PostToolUse hook: blocks any Edit/Write/MultiEdit that pushes a function's
# cognitive complexity above 20. Reads the JSON tool payload from stdin.
#
# Exit codes:
#   0 = pass (rule satisfied or file out of scope)
#   2 = block (rule violated; the message goes back to the model)
#   1 = soft warning (transient infra failure; do not block edits)

set -uo pipefail

PROJECT_ROOT="/Users/ponyo877/Documents/workspace/github.com/ponyo877/auto-2048"

payload=$(cat)
file_path=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)

if [[ -z "$file_path" ]]; then
  exit 0
fi

case "$file_path" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs) ;;
  *) exit 0 ;;
esac

# Only enforce within this project
case "$file_path" in
  "$PROJECT_ROOT"/*) ;;
  *) exit 0 ;;
esac

# Skip vendored / generated files
case "$file_path" in
  *"/node_modules/"*|*"/dist/"*|*"/core/third_party/"*|*"/public/solver.js") exit 0 ;;
esac

if [[ ! -d "$PROJECT_ROOT/node_modules/eslint" ]]; then
  # Tooling not yet installed — let edits through but warn loudly to stderr
  echo "[check-complexity] node_modules missing; skipping. Run \`npm install\` to enable the gate." >&2
  exit 0
fi

cd "$PROJECT_ROOT"
output=$(npx --no-install eslint \
  --no-eslintrc \
  --config .eslintrc.cognitive.cjs \
  --resolve-plugins-relative-to . \
  --rule 'sonarjs/cognitive-complexity: [error, 20]' \
  "$file_path" 2>&1)
status=$?

if [[ $status -ne 0 ]]; then
  echo "Cognitive complexity gate FAILED for $file_path (threshold = 20):" >&2
  echo "$output" >&2
  echo "" >&2
  echo "Action: split the offending function into smaller helpers, then re-save." >&2
  exit 2
fi

exit 0

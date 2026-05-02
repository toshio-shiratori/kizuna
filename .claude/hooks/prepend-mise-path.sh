#!/bin/sh
input=$(cat)
command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

case "$command" in
  ''|*".local/share/mise/shims"*) exit 0 ;;
esac

new_command="export PATH=\"\$HOME/.local/share/mise/shims:/opt/homebrew/bin:\$PATH\" && ${command}"
tool_input=$(printf '%s' "$input" | jq --arg cmd "$new_command" '.tool_input | .command = $cmd')

printf '%s' "$tool_input" | jq '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    updatedInput: .
  }
}'

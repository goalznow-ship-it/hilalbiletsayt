#!/usr/bin/env sh
# Replaces every "change-me…" value in an env file with a random secret.
# Usage: ./scripts/generate-secrets.sh .env
set -eu
file="${1:-.env}"
[ -f "$file" ] || { echo "No such file: $file (cp .env.example .env first)" >&2; exit 1; }

secret() { openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48; }

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
changed=0
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    \#*|"") printf '%s\n' "$line" ;;
    *=change-me*)
      printf '%s=%s\n' "${line%%=*}" "$(secret)"
      changed=$((changed + 1)) ;;
    *) printf '%s\n' "$line" ;;
  esac
done < "$file" > "$tmp"
cat "$tmp" > "$file"
chmod 600 "$file"
echo "Generated $changed secret(s) in $file (mode 600)."
echo "The first administrator's password is BOOTSTRAP_ADMIN_PASSWORD in $file; remove it after the first login."

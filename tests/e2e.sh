#!/usr/bin/env bash
# Bout en bout sur un projet de démo : copier copy → hx detect --write → setup → doctor → check.
# Usage : tests/e2e.sh <fixture>   (node, python, dotnet, go, mixed)
set -euo pipefail

fixture="${1:?usage : tests/e2e.sh <fixture>}"
repo="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
copier=(uvx --from "copier==${COPIER_VERSION:-9.19.1}" copier)
hx() { node .harness/hx.mjs "$@"; }

cp -r "$repo/tests/fixtures/$fixture" "$work/$fixture"
cd "$work/$fixture"
git init -q
git add -A
git -c user.email=ci@example.com -c user.name=ci commit -qm "fixture $fixture"

"${copier[@]}" copy --trust --defaults --vcs-ref HEAD "$repo" .

hx detect --write
hx run setup || [ $? -eq 3 ]   # 3 : pas de commande setup pour cette stack
hx doctor
hx check

# Les fichiers CI générés sont du YAML valide, et le workflow appelle bien l'action d'outillage.
uv run --no-project --quiet --with pyyaml python - .github/workflows/hx-check.yml .harness/ci/setup/action.yml <<'PY'
import sys, yaml
workflow, action = (yaml.safe_load(open(f)) for f in sys.argv[1:])
steps = workflow["jobs"]["check"]["steps"]
assert any(s.get("uses") == "./.harness/ci/setup" for s in steps), "action d'outillage non appelée"
assert action["runs"]["using"] == "composite"
PY
echo "e2e $fixture : OK"

#!/usr/bin/env bash
# Evals comportementales : un agent Claude Code headless sur un projet de démo, puis notation déterministe.
# Usage : evals/run.sh [--runs N] [--without <skill>] [scénario…]
#   --without <skill> : retire ce skill du projet (A/B, pour mesurer son apport réel).
# Coût : chaque exécution appelle réellement le modèle (claude -p).
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
runs=1
without=""
scenarios=()
while [ $# -gt 0 ]; do
  case "$1" in
    --runs) runs="$2"; shift 2 ;;
    --without) without="$2"; shift 2 ;;
    *) scenarios+=("$1"); shift ;;
  esac
done
[ ${#scenarios[@]} -gt 0 ] || mapfile -t scenarios < <(ls "$repo/evals/scenarios")
copier=(uvx --from "copier==${COPIER_VERSION:-9.19.1}" copier)
tools=(Read Edit Write Glob Grep Agent Task Skill TodoWrite "Bash(node *)" "Bash(npm *)" "Bash(npx *)" "Bash(git *)" "Bash(openspec *)" "Bash(ls *)" "Bash(cat *)")
passed=0
total=0

printf '%-14s %-4s %-8s %8s %8s  %s\n' scénario run verdict durée coût dossier
for scenario in "${scenarios[@]}"; do
  dir="$repo/evals/scenarios/$scenario"
  for run in $(seq 1 "$runs"); do
    work="$(mktemp -d)"
    cp -r "$repo/tests/fixtures/$(cat "$dir/fixture")" "$work/proj"
    cd "$work/proj"
    git init -q && git add -A && git -c user.email=eval@example.com -c user.name=eval commit -qm fixture
    "${copier[@]}" copy --trust --defaults --vcs-ref HEAD "$repo" . > /dev/null 2>&1
    node .harness/hx.mjs detect --write > /dev/null 2>&1
    node .harness/hx.mjs run setup > /dev/null 2>&1 || true
    [ -z "$without" ] || rm -rf ".claude/skills/$without"
    [ ! -f "$dir/setup.sh" ] || bash "$dir/setup.sh"
    git add -A && git -c user.email=eval@example.com -c user.name=eval commit -qm "état initial" || true

    claude -p "$(cat "$dir/prompt.md")" --output-format json --permission-mode acceptEdits \
      --max-turns 80 --allowedTools "${tools[@]}" > "$work/result.json" 2> "$work/stderr.log" || true
    node -e "
      const r = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
      require('fs').writeFileSync(process.argv[2], r.result ?? '');
      console.log(((r.duration_ms ?? 0) / 1000).toFixed(0) + 's ' + (r.total_cost_usd ?? 0).toFixed(2) + '\$');
    " "$work/result.json" "$work/result.txt" > "$work/metrics" 2>/dev/null || echo "? ?" > "$work/metrics"

    total=$((total + 1))
    read -r duration cost < "$work/metrics"
    if RESULT="$work/result.txt" bash "$dir/grade.sh" > "$work/grade.log" 2>&1; then
      verdict=pass; passed=$((passed + 1)); keep=""
    else
      verdict=FAIL; keep="$work"
    fi
    printf '%-14s %-4s %-8s %8s %8s  %s\n' "$scenario" "$run" "$verdict" "$duration" "$cost" "$keep"
    cd "$repo"
    [ -n "$keep" ] || rm -rf "$work"
  done
done
echo
echo "Réussite : $passed/$total${without:+ (sans $without)}"
[ "$passed" -eq "$total" ]

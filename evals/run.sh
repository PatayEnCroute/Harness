#!/usr/bin/env bash
# Evals comportementales : un agent Claude Code headless sur un projet de démo, puis notation déterministe.
# Usage : evals/run.sh [--runs N] [--without <skill|agent>] [scénario…]
#   --runs N          : N exécutions par scénario (taux k/n ; il faut n ≥ 10 pour distinguer 90 % de 70 %).
#   --without <nom>   : retire ce skill (ou cet agent) et les lignes qui le citent (A/B, pour mesurer son apport réel).
# Variables : EVAL_MODEL (modèle épinglé), EVAL_TIMEOUT (secondes par exécution), EVAL_MAX_TURNS.
# Coût : chaque exécution appelle réellement le modèle (claude -p).
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
evals="$repo/evals"
runs=1
without=""
scenarios=()
while [ $# -gt 0 ]; do
  case "$1" in
    --runs) runs="${2:?--runs attend un nombre}"; shift 2 ;;
    --without) without="${2:?--without attend un nom}"; shift 2 ;;
    -*) echo "evals : option inconnue $1" >&2; exit 2 ;;
    *) scenarios+=("$1"); shift ;;
  esac
done
[[ "$runs" =~ ^[1-9][0-9]*$ ]] || { echo "evals : --runs attend un entier ≥ 1" >&2; exit 2; }
[ ${#scenarios[@]} -gt 0 ] || mapfile -t scenarios < <(ls "$evals/scenarios")
for scenario in "${scenarios[@]}"; do
  [ -f "$evals/scenarios/$scenario/prompt.md" ] || { echo "evals : scénario inconnu « $scenario »" >&2; exit 2; }
done
if [ -n "$without" ] && [ ! -d "$repo/template/.claude/skills/$without" ] && [ ! -f "$repo/template/.claude/agents/$without.md" ]; then
  echo "evals : « $without » n'est ni un skill ni un agent du template" >&2; exit 2
fi

model="${EVAL_MODEL:-claude-sonnet-5-5}"
timeout_s="${EVAL_TIMEOUT:-1200}"
max_turns="${EVAL_MAX_TURNS:-80}"
variant="${without:+without:$without}"
variant="${variant:-full}"
copier=(uvx --from "copier==${COPIER_VERSION:-9.19.1}" copier)
# Aucune règle Bash ici : les commandes passent par les seules permissions du template (.claude/settings.json),
# comme chez l'utilisateur. Une commande refusée fait échouer l'exécution (no_permission_denials).
tools=(Read Edit Write Glob Grep Agent Task Skill TodoWrite)
git_env=(-c user.email=eval@example.com -c user.name=eval)

claude_version="$(claude --version 2>/dev/null | head -n1 || echo inconnue)"
sha="$(git -C "$repo" rev-parse --short HEAD)"
started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
mkdir -p "$evals/results"
results="$evals/results/$(date -u +%Y%m%dT%H%M%SZ)-${variant/:/-}.jsonl"
campaign="$(mktemp -d "${TMPDIR:-/tmp}/hx-evals.XXXXXX")"
# Le template installé est celui du commit HEAD (copier --vcs-ref HEAD) : les modifications non commitées ne sont pas évaluées.
[ -z "$(git -C "$repo" status --porcelain -- template copier.yml)" ] || echo "⚠ template/ modifié non commité : les evals portent sur HEAD ($sha)" >&2

on_err() { echo "evals : erreur inattendue (scénario ${scenario:-?}, exécution ${run:-?}) : $BASH_COMMAND" >&2; }
trap on_err ERR

# Retire un skill ou un agent, et chaque ligne qui le cite dans les instructions du projet (suppression ligne à ligne).
remove_component() {
  local name="$1" found=""
  [ ! -d ".claude/skills/$name" ] || { rm -rf ".claude/skills/$name"; found=1; }
  [ ! -f ".claude/agents/$name.md" ] || { rm -f ".claude/agents/$name.md"; found=1; }
  [ -n "$found" ] || { echo "« $name » n'est ni un skill ni un agent du template" >&2; return 1; }
  local file
  for file in CLAUDE.md .claude/rules/*.md openspec/config.yaml .claude/skills/*/SKILL.md .claude/agents/*.md; do
    if [ ! -f "$file" ] || ! grep -qFw -- "$name" "$file"; then continue; fi
    grep -vFw -- "$name" "$file" > "$file.tmp" || true
    mv "$file.tmp" "$file"
    echo "--without : lignes citant $name retirées de $file"
  done
}

# État initial du projet : fixture, template, setup.sh du scénario, variante A/B. Sortie dans setup.log.
prepare() {
  local dir="$1" work="$2"
  set -eE
  trap 'echo "✗ préparation : échec de « $BASH_COMMAND »" >&2' ERR
  cp -r "$repo/tests/fixtures/$(cat "$dir/fixture")" "$work/proj"
  cd "$work/proj"
  git init -q -b main && git add -A && git "${git_env[@]}" commit -qm fixture
  "${copier[@]}" copy --trust --defaults --vcs-ref HEAD "$repo" .
  if [ -f "$dir/setup.sh" ]; then
    # shellcheck source=/dev/null
    source "$dir/setup.sh"
  fi
  if [ -n "$without" ]; then remove_component "$without"; fi
  # Référence pour l'intégrité de la notation : ce que l'agent ne doit pas pouvoir truquer.
  mkdir -p "$work/pristine"
  cp .harness/hx.mjs .harness/hooks.mjs .harness/config.json "$work/pristine/"
  git add -A && git "${git_env[@]}" commit -qm "état initial"
  git rev-parse HEAD > "$work/initial-sha"
}

# Avant de noter : outils du harness restaurés, contrat inchangé (sauf scénario qui a le droit de l'écrire).
integrity() {
  local dir="$1" work="$2"
  cp "$work/pristine/hx.mjs" "$work/pristine/hooks.mjs" .harness/
  if [ ! -f "$dir/config-writable" ] && ! cmp -s "$work/pristine/config.json" .harness/config.json; then
    echo "✗ .harness/config.json modifié par l'agent :"
    diff "$work/pristine/config.json" .harness/config.json || true
    return 1
  fi
}

record() {
  R_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" R_SHA="$sha" R_SCENARIO="$1" R_VARIANT="$variant" R_RUN="$2" \
  R_VERDICT="$3" R_DURATION="$4" R_COST="$5" R_VERSION="$claude_version" R_MODEL="$model" R_DIR="$6" R_REASON="$7" \
  node -e '
    const e = process.env, num = (v) => (v === "" || Number.isNaN(Number(v)) ? null : Number(v));
    console.log(JSON.stringify({
      date: e.R_DATE, sha: e.R_SHA, scenario: e.R_SCENARIO, variant: e.R_VARIANT, run: Number(e.R_RUN),
      pass: e.R_VERDICT === "pass", verdict: e.R_VERDICT, reason: e.R_REASON || null, duration_s: num(e.R_DURATION), cost_usd: num(e.R_COST),
      claude_version: e.R_VERSION, model: e.R_MODEL, kept_dir: e.R_DIR || null,
    }));
  ' >> "$results"
}

declare -A pass_by
passed=0
total=0
echo "Modèle $model · $claude_version · template $sha · variante $variant · $runs exécution(s) par scénario"
printf '%-14s %-4s %-8s %8s %8s  %s\n' scénario run verdict durée coût dossier
for scenario in "${scenarios[@]}"; do
  dir="$evals/scenarios/$scenario"
  pass_by[$scenario]=0
  for run in $(seq 1 "$runs"); do
    work="$campaign/$scenario-$run"
    mkdir -p "$work"
    verdict=FAIL duration="" cost="" reason=""
    total=$((total + 1))

    # set -e reste actif dans le sous-shell seulement hors contexte « || » ou « if ».
    set +e; trap - ERR
    ( prepare "$dir" "$work" ) > "$work/setup.log" 2>&1
    rc=$?
    set -e; trap on_err ERR
    if [ "$rc" -ne 0 ]; then
      verdict=ERREUR
      echo "✗ $scenario #$run : préparation en échec ($work/setup.log)" >&2
      tail -n 20 "$work/setup.log" | sed 's/^/    /' >&2
    else
      cd "$work/proj"
      rc=0
      # Scénario dont la tâche est d'écrire le contrat (setup) : personne ne peut confirmer en headless.
      unattended=()
      [ ! -f "$dir/config-writable" ] || unattended=(HX_ALLOW_CONFIG_EDITS=1)
      # Dossier temporaire jamais approuvé (trust) : claude -p y ignore permissions.allow du projet. On repasse les
      # permissions du template par --settings, qui s'applique toujours : mêmes règles que chez l'utilisateur, rien d'ajouté.
      permissions="$(node -e 'const s = JSON.parse(require("fs").readFileSync(".claude/settings.json", "utf8")); console.log(JSON.stringify({ permissions: s.permissions }))')"
      # Un tour par prompt : prompt.md, puis followup.md s'il existe (réponse de l'utilisateur, même conversation).
      turn=()
      for prompt in "$dir/prompt.md" "$dir/followup.md"; do
        [ -f "$prompt" ] || continue
        env "${unattended[@]}" timeout "$timeout_s" claude -p "$(cat "$prompt")" "${turn[@]}" --settings "$permissions" --model "$model" \
          --output-format stream-json --verbose --permission-mode acceptEdits \
          --max-turns "$max_turns" --allowedTools "${tools[@]}" \
          >> "$work/transcript.jsonl" 2>> "$work/stderr.log" < /dev/null || rc=$?
        [ "$rc" -ne 124 ] || echo "⚠ $scenario #$run : délai de ${timeout_s}s dépassé" >&2
        [ "$rc" -eq 0 ] || break
        turn=(--continue)
      done
      # Durée et coût cumulés sur les tours ; result.txt : réponse du dernier tour.
      node -e '
        const fs = require("fs");
        const results = fs.readFileSync(process.argv[1], "utf8").split("\n")
          .map((l) => { try { return JSON.parse(l); } catch { return null; } })
          .filter((e) => e?.type === "result");
        const sum = (key) => results.reduce((n, r) => n + (r[key] ?? 0), 0);
        fs.writeFileSync(process.argv[2], results.at(-1)?.result ?? "");
        console.log((sum("duration_ms") / 1000).toFixed(0), sum("total_cost_usd").toFixed(4));
      ' "$work/transcript.jsonl" "$work/result.txt" > "$work/metrics" 2>> "$work/stderr.log" || echo "" > "$work/metrics"
      read -r duration cost < "$work/metrics" || true

      set +e; trap - ERR
      (
        set -e
        integrity "$dir" "$work"
        TRANSCRIPT="$work/transcript.jsonl" bash -c 'source "$1"; no_permission_denials' grade "$evals/lib/grade.sh"
        RESULT="$work/result.txt" TRANSCRIPT="$work/transcript.jsonl" EVAL_LIB="$evals/lib" INITIAL_SHA="$(cat "$work/initial-sha")" \
          bash -c 'set -eE; trap "echo \"✗ échec : \$BASH_COMMAND\" >&2" ERR; source "$1"' grade "$dir/grade.sh"
      ) > "$work/grade.log" 2>&1
      rc=$?
      set -e; trap on_err ERR
      [ "$rc" -ne 0 ] || verdict=pass
      cd "$repo"
    fi

    # Raison d'un échec : première ligne « ✗ » du journal de notation (ou de préparation), pour l'historique.
    if [ "$verdict" != pass ]; then
      log="$work/grade.log"
      [ "$verdict" != ERREUR ] || log="$work/setup.log"
      reason="$(grep '✗' "$log" 2>/dev/null | head -n 1 | sed 's/^[[:space:]]*✗[[:space:]]*//' | cut -c1-300 || true)"
    fi
    keep="$work"
    if [ "$verdict" = pass ]; then
      passed=$((passed + 1)); pass_by[$scenario]=$((pass_by[$scenario] + 1)); keep=""
    fi
    record "$scenario" "$run" "$verdict" "$duration" "$cost" "$keep" "$reason"
    printf '%-14s %-4s %-8s %8s %8s  %s\n' "$scenario" "$run" "$verdict" "${duration:-?}s" "${cost:-?}\$" "$keep"
    [ -z "$reason" ] || echo "    ✗ $reason"
    [ -n "$keep" ] || rm -rf "$work"
  done
done
trap - ERR

echo
echo "Taux de réussite (variante $variant) :"
for scenario in "${scenarios[@]}"; do
  printf '  %-14s %s/%s\n' "$scenario" "${pass_by[$scenario]}" "$runs"
done
echo "  total          $passed/$total"
[ "$runs" -ge 10 ] || echo "⚠ n = $runs < 10 par scénario : impossible de distinguer 90 % de 70 % de réussite. Pour décider (élagage), --runs 10 au moins."
echo "Résultats : ${results#"$repo"/} (à commiter pour l'historique) · début $started"
if [ "$passed" -lt "$total" ]; then echo "Dossiers des échecs conservés sous $campaign"; else rmdir "$campaign" 2>/dev/null || true; fi
[ "$passed" -eq "$total" ]

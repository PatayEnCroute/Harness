#!/usr/bin/env bash
# Bout en bout, tous les harness : copier copy avec tools → fichiers de chaque harness → hooks dans chaque protocole
# → dérive détectée et réparée → copier update qui retire un harness.
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
copier=(uvx --from "copier==${COPIER_VERSION:-9.19.1}" copier)
hx() { node .harness/hx.mjs "$@"; }
fail() { echo "ÉCHEC : $*" >&2; exit 1; }
commit() { git add -A && git -c user.email=ci@example.com -c user.name=ci commit -qm "$1"; }

# Template : l'état courant du repo (modifications non commitées comprises), tagué pour que copier update le retrouve.
cp -r "$repo" "$work/tmpl"
cd "$work/tmpl"
commit "v1" || true
git tag -f v1 >/dev/null

cp -r "$repo/tests/fixtures/node" "$work/demo"
cd "$work/demo"
git init -q
commit "fixture"

"${copier[@]}" copy --trust --defaults --vcs-ref v1 --data 'tools=[codex,opencode,antigravity,dsh]' "$work/tmpl" .
hx detect --write
commit "harness"

for file in AGENTS.md .codex/hooks.json .codex/config.toml .agents/skills/hx-setup/agents/openai.yaml .codex/agents/hx-explorer.toml .codex/rules/harness.rules \
  .opencode/opencode.json .opencode/plugins/hx-harness.js .opencode/agents/hx-explorer.md \
  .agents/hooks.json .agents/agents/hx-explorer.md .agents/rules/testing.md .agents/skills/hx-triage/SKILL.md \
  .dsh/hooks.json .dsh/harness.patch.yml; do
  [ -f "$file" ] || fail "$file absent"
done
# OpenSpec installe ses propres skills dans le dossier de chaque harness.
for dir in .claude/skills .agents/skills .opencode/skills .dsh/skills; do
  [ -f "$dir/openspec-propose/SKILL.md" ] || fail "skills OpenSpec absents de $dir"
done
hx adapters --check
hx doctor --no-run | grep -q "✓ Autres harness : Codex, OpenCode, Antigravity, DeepSeek Harness" || fail "doctor ne voit pas les autres harness"

# Validation par de vrais outils, pas seulement par nos tests : parseurs TOML et YAML, schéma officiel d'OpenCode,
# et la CLI Codex pour les règles de commandes (execpolicy : aucune clé d'API requise).
curl -fsSL --retry 3 https://opencode.ai/config.json -o "$work/opencode-schema.json"
uv run --no-project --quiet --with pyyaml --with jsonschema python "$repo/tests/validate-adapters.py" "$work/opencode-schema.json"
policy() { npx --yes "@openai/codex@${CODEX_VERSION:-0.167.0}" execpolicy check --rules .codex/rules/harness.rules -- "$@"; }
policy git status | grep -q '"decision":"allow"' || fail "Codex : git status non autorisé par harness.rules"
policy node .harness/hx.mjs check | grep -q '"decision":"allow"' || fail "Codex : hx check non autorisé par harness.rules"
policy git commit -m tâche | grep -q '"decision":"allow"' || fail "Codex : git commit non autorisé par harness.rules"
for left in "git push" "git branch -D main" "rm -rf src"; do
  # shellcheck disable=SC2086
  policy $left | grep -q '"matchedRules":\[\]' || fail "Codex : « $left » doit rester au mode de permission"
done

# Les hooks câblés dans chaque fichier généré répondent dans le protocole du harness.
codex_cmd="$(node -e 'console.log(require("./.codex/hooks.json").hooks.PreToolUse[0].hooks[0].command)')"
patch=$'*** Begin Patch\n*** Update File: .harness/hx.mjs\n@@\n*** End Patch'
out="$(node -e 'console.log(JSON.stringify({session_id:"e2e",cwd:process.cwd(),tool_name:"apply_patch",tool_input:{command:process.argv[1]}}))' "$patch" | bash -lc "$codex_cmd")"
echo "$out" | grep -q '"permissionDecision":"deny"' || fail "Codex : édition de hx.mjs non refusée ($out)"

agy_cmd="$(node -e 'console.log(require("./.agents/hooks.json").hx.PreToolUse[0].hooks[0].command)')"
out="$(echo "{\"conversationId\":\"e2e\",\"workspacePaths\":[\"$PWD\"],\"toolCall\":{\"name\":\"run_command\",\"args\":{\"CommandLine\":\"node .harness/hx.mjs check\"}}}" | bash -c "$agy_cmd")"
[ "$out" = '{"decision":"auto_approve"}' ] || fail "Antigravity : hx check non approuvé ($out)"
out="$(echo "{\"conversationId\":\"e2e\",\"workspacePaths\":[\"$PWD\"],\"toolCall\":{\"name\":\"run_command\",\"args\":{\"CommandLine\":\"git push\"}}}" | bash -c "$agy_cmd")"
[ "$out" = '{"decision":"allow"}' ] || fail "Antigravity : git push doit rester au mode de permission ($out)"

dsh_cmd="$(node -e 'console.log(require("./.dsh/hooks.json").hooks.PreToolUse[0].hooks[0].command)')"
out="$(echo '{"session_id":"e2e","tool_name":"skill","tool_input":{"name":"openspec-apply-change"}}' | CLAUDE_PROJECT_DIR="$PWD" bash -c "$dsh_cmd")"
echo "$out" | grep -q 'hx-implement' || fail "dsh : openspec-apply-change non redirigé ($out)"

out="$(echo "{\"session_id\":\"e2e\",\"tool\":\"edit\",\"args\":{\"filePath\":\"openspec/specs/calc/spec.md\"}}" | node .harness/hooks.mjs pre-tool-use --tool opencode)"
echo "$out" | grep -q '/opsx:sync' || fail "OpenCode : pas de rappel sur une spec principale ($out)"

# Dérive : la carte du projet change, hx check le refuse, hx adapters répare.
printf '\n## Conventions\n\nPas de point-virgule.\n' >> .harness/project.md
if hx adapters --check >/dev/null; then fail "dérive non détectée"; fi
if hx check >/dev/null 2>&1; then fail "hx check vert malgré des fichiers périmés"; fi
hx adapters
grep -q "Pas de point-virgule" AGENTS.md || fail "AGENTS.md non régénéré"
hx adapters --check
commit "carte du projet"

# copier update avec un harness en moins : ses fichiers partent, les autres restent à jour.
"${copier[@]}" update --trust --defaults --vcs-ref v1 --data 'tools=[codex]'
[ ! -e .opencode/plugins ] && [ ! -e .dsh/hooks.json ] && [ ! -e .agents/hooks.json ] || fail "fichiers d'un harness retiré encore présents"
[ -f .codex/hooks.json ] && [ -f .agents/skills/hx-triage/SKILL.md ] || fail "fichiers de Codex perdus"
hx adapters --check
echo "e2e adapters : OK"

#!/usr/bin/env bash
# Cycle complet d'un change OpenSpec dans un projet installé : la trace bloque tant qu'un scénario
# n'a pas de test, les hooks réagissent, l'archive garde la traçabilité, la dérive est détectée.
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
copier=(uvx --from "copier==${COPIER_VERSION:-9.19.1}" copier)
hx() { node .harness/hx.mjs "$@"; }
hook() { CLAUDE_PROJECT_DIR="$PWD" node .harness/hooks.mjs "$@"; }
fail() { echo "ÉCHEC : $1" >&2; exit 1; }
step() { echo; echo "── $1"; }

cp -r "$repo/tests/fixtures/node" "$work/proj"
cd "$work/proj"
git init -q
git add -A
git -c user.email=ci@example.com -c user.name=ci commit -qm fixture
"${copier[@]}" copy --trust --defaults --vcs-ref HEAD "$repo" . > /dev/null
hx detect --write
hx run setup > /dev/null

step "Change M avec un scénario sans test : hx check doit échouer sur la trace"
hx openspec new change add-mult > /dev/null
change=openspec/changes/add-mult
echo 'x-track: M' >> "$change/.openspec.yaml"
cat > "$change/proposal.md" <<'EOF'
## Why
Need multiplication to compute invoice line totals.

## What Changes
- Add a multiplication function

## Capabilities

### New Capabilities
- `calc`: arithmetic used by invoices

### Modified Capabilities

## Impact
src/mult.js
EOF
mkdir -p "$change/specs/calc"
cat > "$change/specs/calc/spec.md" <<'EOF'
## Purpose
Arithmetic operations used to compute invoice lines and totals.

## ADDED Requirements

### Requirement: Multiplication
The system SHALL multiply two integers.

#### Scenario: Multiply two numbers
- **WHEN** multiplying 2 and 3
- **THEN** the result is 6
EOF
printf '## 1. Multiplication\n\n- [ ] 1.1 Write the test\n- [ ] 1.2 Implement\n' > "$change/tasks.md"
if hx check > check.log 2>&1; then fail "check vert malgré un scénario sans test"; fi
grep -q 'calc/multiply-two-numbers (add-mult)' check.log || fail "la trace ne cite pas le scénario manquant"

step "Hooks : contexte de session et confirmation avant d'écrire une spec principale"
hook session-start < /dev/null | grep -q 'add-mult (piste M, cadrage non validé, 0/2 tâches)' || fail "session-start"
echo "{\"tool_input\":{\"file_path\":\"$PWD/openspec/specs/calc/spec.md\"}}" | hook pre-tool-use | grep -q '"ask"' || fail "pre-tool-use"

step "Test tagué puis implémentation : hx check vert"
cat > test/mult.test.js <<'EOF'
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mult } from '../src/mult.js';

// @scenario calc/multiply-two-numbers
test('multiplies two numbers', () => {
  assert.equal(mult(2, 3), 6);
});
EOF
echo 'export const mult = (a, b) => a * b;' > src/mult.js
hx check

step "Archive : la spec principale garde la traçabilité"
sed -i 's/- \[ \]/- [x]/' "$change/tasks.md"
hx openspec archive add-mult -y > /dev/null
[ -f openspec/specs/calc/spec.md ] || fail "spec principale absente après archive"
hx check

step "Cadrage parallèle : le change validé part dans son worktree, le dossier principal reste vert"
export GIT_AUTHOR_NAME=ci GIT_AUTHOR_EMAIL=ci@example.com GIT_COMMITTER_NAME=ci GIT_COMMITTER_EMAIL=ci@example.com
git add -A && git commit -qm "harness + add-mult"
hx openspec new change add-div > /dev/null
div=openspec/changes/add-div
printf 'x-track: M\nx-validated: 2026-10-18\n' >> "$div/.openspec.yaml"
mkdir -p "$div/specs/calc"
cat > "$div/specs/calc/spec.md" <<'EOF'
## ADDED Requirements

### Requirement: Division
The system SHALL divide two integers.

#### Scenario: Divide two numbers
- **WHEN** dividing 6 by 3
- **THEN** the result is 2
EOF
printf '## 1. Division\n\n- [ ] 1.1 div(6, 3) returns 2\n' > "$div/tasks.md"
if hx check > div.log 2>&1; then fail "check vert malgré add-div sans test"; fi
hx worktree add-div > worktree.log || { cat worktree.log; fail "hx worktree"; }
grep -q 'hx-implement add-div' worktree.log || fail "commande de lancement du run absente"
[ ! -e "$div" ] || fail "add-div encore dans le dossier principal"
rm div.log worktree.log
hx check > /dev/null || fail "dossier principal rouge après le départ de add-div"
wt="$work/proj-add-div"
[ "$(git -C "$wt" log -1 --format=%s)" = "add-div : proposition" ] || fail "proposition non commitée dans le worktree"
(cd "$wt" && node .harness/hx.mjs trace || true) | grep -q 'calc/divide-two-numbers (add-div)' || fail "trace du worktree"
git worktree remove --force "$wt"

step "Dérive : test détaché de son scénario → hx check rouge"
sed -i 's#// @scenario calc/multiply-two-numbers##' test/mult.test.js
if hx check > drift.log 2>&1; then fail "check vert malgré un scénario des specs sans test"; fi
grep -q '0/1 scénarios couverts' drift.log || fail "la couverture n'est pas signalée"

echo
echo "e2e openspec : OK"

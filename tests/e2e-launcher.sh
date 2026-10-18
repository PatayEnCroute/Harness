#!/usr/bin/env bash
# Lanceur npx : installation en une commande dans un dossier vide, refus sur un arbre git sale.
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
fail() { echo "ÉCHEC : $1" >&2; exit 1; }

# Template : l'état courant du repo (modifications non commitées comprises), comme e2e-update.sh.
cp -r "$repo" "$work/tmpl"
(cd "$work/tmpl" && git add -A && git -c user.email=ci@example.com -c user.name=ci commit -qm "courant" || true)
harness() { npx --yes "$work/tmpl" --template "$work/tmpl" --vcs-ref HEAD --defaults --no-claude "$@"; }

# 1. Dossier vide : git init, puis installation complète.
mkdir "$work/neuf" && cd "$work/neuf"
harness </dev/null
[ -d .git ] || fail "git init non fait"
[ -f .harness/hx.mjs ] && [ -f .copier-answers.yml ] && [ -f CLAUDE.md ] || fail "template non installé"
[ -d openspec ] || fail "openspec init non lancé"

# 2. Déjà installé : refus, avec la commande de mise à jour.
git add -A && git -c user.email=ci@example.com -c user.name=ci commit -qm "harness"
out="$(harness </dev/null 2>&1)" && fail "réinstallation acceptée"
grep -q "update --trust" <<<"$out" || fail "commande de mise à jour non proposée : $out"

# 3. Projet existant avec des changements non commités : refus, rien d'écrit.
mkdir "$work/sale" && cd "$work/sale"
git init -q && echo x > a.txt && git add -A && git -c user.email=ci@example.com -c user.name=ci commit -qm init
echo y > a.txt
harness </dev/null 2>/dev/null && fail "arbre sale accepté"
[ ! -e .harness ] || fail "installation sur un arbre sale"

echo "OK : lanceur npx"
